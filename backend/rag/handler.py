"""Floss API Lambda behind API Gateway (HTTP API): chat history and Bedrock RAG over the caller's own rows.

Sign-in is Amazon Cognito (phone number + password). API Gateway's JWT authorizer validates the Cognito ID
token before this code runs; the verified `phone_number` claim is the caller's identity.

Routes (all JSON, all need "Authorization: Bearer <Cognito ID token>"):
  GET  /v1/me                              -> the signed-in user and family
  GET  /v1/conversations                   -> chat threads, newest first, each tagged with its channel (app / whatsapp / ...)
  GET  /v1/messages?conversationId=&limit= -> one thread's messages, oldest first (all threads when conversationId is omitted)
  POST /v1/turns        {"text","conversationId"?} -> runs RAG now, stores both messages, returns {"turnId","conversationId"};
                                               no conversationId = "New chat"
  GET  /v1/turns/{id}                      -> {"id","status":"completed","reply": Message}
The phone always comes from the verified token, never the request, so one patient can never read another's rows.

POST /v1/twilio/sms is the one route without a JWT: Twilio's SMS/WhatsApp webhook. It is authenticated by the X-Twilio-Signature
header instead, and the sender's phone number (From) is the identity. It answers in the TwiML reply, so no outbound internet is needed.

Answer flow (backend/rag/advisor.py): a first model call only picks the person and treatments; code looks up the stored estimates and does all
the arithmetic; a second call writes the reply in the voice of the family's advocate from those facts; any figure, email, phone number or
link that is not in the facts is rejected (one retry, then a code-written reply).
"""
import base64
import hashlib
import hmac
import json
import os
import re
import ssl
import traceback
import time
import uuid
from datetime import date, timezone
from urllib.parse import parse_qsl
from xml.sax.saxutils import escape

import boto3
import pg8000.native

import advisor

REGION = os.environ.get("AWS_REGION", "us-west-2")
DB_HOST = os.environ["DB_HOST"]
DB_PORT = int(os.environ.get("DB_PORT", "8443"))
DB_USER = os.environ.get("DB_USER", "api_app")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
EMBED_MODEL = "amazon.titan-embed-text-v2:0"
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WEBHOOK_URL = os.environ.get("TWILIO_WEBHOOK_URL", "")  # only needed behind a custom domain; Twilio signs the exact URL it calls
TWILIO_BUDGET_MS = 13000  # Twilio gives up on a webhook after 15 s
WHATSAPP_IDLE_SECONDS = 24 * 3600  # a text after this long starts a new conversation
TOP_K = 5
HISTORY_TURNS = 20  # messages (10 exchanges) of this chat replayed to the model

_CTX = None  # Lambda context of the current invocation, for the remaining-time check
rds = boto3.client("rds", region_name=REGION)
bedrock = boto3.client("bedrock-runtime", region_name=REGION)
SSL = ssl.create_default_context(cafile=os.path.join(os.path.dirname(__file__), "rds-global-bundle.pem"))
SSL.minimum_version = ssl.TLSVersion.TLSv1_2  # never fall back below TLS 1.2 to the database
PHONE_RE = re.compile(r"^\+[1-9]\d{9,14}$")
TWILIO_KEYWORDS = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "START", "UNSTOP", "YES", "HELP", "INFO"}

def _connect():
    token = rds.generate_db_auth_token(DBHostname=DB_HOST, Port=DB_PORT, DBUsername=DB_USER, Region=REGION)
    return pg8000.native.Connection(user=DB_USER, password=token, host=DB_HOST, port=DB_PORT,
                                    database="postgres", ssl_context=SSL, timeout=10)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _embed(text):
    body = json.dumps({"inputText": text, "dimensions": 1024, "normalize": True})
    return json.loads(bedrock.invoke_model(modelId=EMBED_MODEL, body=body)["body"].read())["embedding"]


def _user_json(row):
    phone, name, birth_date, member_number, employer, insurance, family = row
    return {"phone": phone, "name": name, "birthDate": birth_date.isoformat(), "memberNumber": member_number, "employer": employer, "insurance": insurance,
            "family": json.loads(family) if isinstance(family, str) else family}


def _message_json(row):
    mid, role, channel, text, created = row
    return {"id": str(mid), "role": role, "channel": channel, "text": text, "cards": [], "createdAt": _iso(created)}


# ---------------------------------------------------------------- auth

def _token_phone(conn, event):
    """The phone of the signed-in person, from the claims API Gateway already verified. Must belong to a Floss user."""
    claims = (event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}) or {}).get("claims", {}) or {}
    phone = str(claims.get("phone_number", ""))
    if claims.get("token_use") != "id" or not PHONE_RE.match(phone):
        raise ApiErr(401, "unauthenticated", "Please sign in again.")
    if not conn.run("SELECT 1 FROM users WHERE phone = :p", p=phone):
        raise ApiErr(403, "forbidden", "That number isn't on a Floss plan.")
    return phone


# ---------------------------------------------------------------- chat

def _retrieve(conn, phone, query):
    """The patient's own treatment rows, best match first (a patient has five, so all of them come back)."""
    vec = "[" + ",".join(f"{x:.7f}" for x in _embed(query)) + "]"
    rows = conn.run(
        "SELECT disease, in_network_cost, in_network_hospital, out_of_network_cost, out_of_network_hospital, cash_cost, "
        "embedding <=> CAST(:v AS vector) AS dist FROM patient_treatment_embeddings WHERE phone = :p ORDER BY dist LIMIT :k",
        v=vec, p=phone, k=TOP_K)
    out = []
    for d, ic, ih, oc, oh, cash, dist in rows:
        try:
            cash_value = float(cash)
        except (TypeError, ValueError):
            cash_value = None  # "Needs manual verification"
        out.append({"disease": d, "in_cost": float(ic), "in_hospital": ih, "out_cost": float(oc), "out_hospital": oh,
                    "cash_value": cash_value, "distance": float(dist)})
    return out


def _answer(conn, phone, conversation_id, question, time_left=None):
    # Replies the guardrail had replaced are left out, so the model never copies their style.
    history = conn.run("SELECT role, text FROM chat_messages WHERE phone = :p AND conversation_id = CAST(:c AS uuid) "
                       "AND role IN ('user','assistant') AND NOT guardrail_replaced ORDER BY created_at DESC LIMIT :n",
                       p=phone, c=conversation_id, n=HISTORY_TURNS)[::-1]
    # The newest history row is the question just stored. Short follow-ups only make sense with the earlier questions,
    # so the search uses the last two of those as well.
    earlier_questions = [t for r, t in history if r == "user"][:-1]
    rows = _retrieve(conn, phone, " ".join(earlier_questions[-2:] + [question]))
    if not rows:
        return "I don't have treatment estimates on file for you yet.", [], False
    who = conn.run("SELECT full_name, insurance, family, member_number, birth_date FROM users WHERE phone = :p", p=phone)[0]
    user = {"first": who[0].split()[0], "full": who[0], "insurance": who[1], "member": who[3], "birth": who[4].isoformat(),
            "family": who[2] if isinstance(who[2], list) else json.loads(who[2])}

    def lookup_contacts(names):
        names = list(dict.fromkeys(names))
        found = {n: (e, ph, u) for n, e, ph, u in conn.run(
            "SELECT name, email, phone, info_url FROM hospital_contacts WHERE name = ANY(CAST(:n AS text[]))", n=names)}
        return [{"name": n, "email": found[n][0], "phone": found[n][1], "url": found[n][2]} for n in names if n in found]

    if time_left is None:
        ctx = _CTX
        time_left = (lambda: ctx.get_remaining_time_in_millis()) if ctx else (lambda: 30000)
    answer, sel, replaced = advisor.respond(bedrock, MODEL_ID, history, question, rows, user, lookup_contacts, date.today(), time_left)
    return answer, [{"disease": d} for d in sel["treatments"]], replaced


def _store_exchange(conn, phone, cid, channel, text, time_left=None):
    """Stores the question, answers it and stores the answer. Returns (answer text, assistant message id)."""
    # Stored first so the chat shows it while the answer is generated; _answer drops it from the history it replays.
    conn.run("INSERT INTO chat_messages (phone, conversation_id, channel, role, text) VALUES (:p, CAST(:c AS uuid), :ch, 'user', :t)",
             p=phone, c=cid, ch=channel, t=text)
    answer, sources, replaced = _answer(conn, phone, cid, text, time_left)
    rid = conn.run("INSERT INTO chat_messages (phone, conversation_id, channel, role, text, sources, guardrail_replaced) "
                   "VALUES (:p, CAST(:c AS uuid), :ch, 'assistant', :t, CAST(:s AS jsonb), :g) RETURNING id",
                   p=phone, c=cid, ch=channel, t=answer, s=json.dumps(sources), g=replaced)[0][0]
    return answer, rid


def _post_turn(conn, phone, body):
    text = str(body.get("text", "")).strip()
    if not text or len(text) > 500:
        raise ApiErr(400, "invalid_request", "Type a message first (max 500 characters).")
    cid = body.get("conversationId")
    if cid:  # continuing a thread: it must be this person's own in-app thread (WhatsApp threads are read-only here)
        _uuid_or_404(cid)
        rows = conn.run("SELECT 1 FROM chat_messages WHERE phone = :p AND conversation_id = CAST(:c AS uuid) AND channel = 'app' LIMIT 1",
                        p=phone, c=cid)
        if not rows:
            raise ApiErr(400, "invalid_request", "That conversation can't be continued here. Start a new chat instead.")
    else:
        cid = str(uuid.uuid4())
    _, rid = _store_exchange(conn, phone, cid, "app", text)
    return 200, {"turnId": str(rid), "conversationId": cid}


def _uuid_or_404(value):
    try:
        uuid.UUID(str(value))
    except ValueError:
        raise ApiErr(404, "not_found", "That request is no longer available.")


def _get_turn(conn, phone, turn_id):
    _uuid_or_404(turn_id)
    rows = conn.run("SELECT id, role, channel, text, created_at FROM chat_messages "
                    "WHERE id = CAST(:i AS uuid) AND phone = :p AND role = 'assistant'", i=turn_id, p=phone)
    if not rows:
        raise ApiErr(404, "not_found", "That request is no longer available.")
    return 200, {"id": turn_id, "status": "completed", "reply": _message_json(rows[0])}


def _list_messages(conn, phone, query):
    try:
        limit = max(1, min(int(query.get("limit", 50)), 200))
    except ValueError:
        limit = 50
    cid = query.get("conversationId")
    if cid:
        _uuid_or_404(cid)
    rows = conn.run("SELECT id, role, channel, text, created_at FROM chat_messages WHERE phone = :p "
                    "AND (CAST(:c AS text) IS NULL OR conversation_id = CAST(:c AS uuid)) ORDER BY created_at DESC LIMIT :n",
                    p=phone, c=cid, n=limit)[::-1]
    return 200, {"messages": [_message_json(r) for r in rows], "nextCursor": None}


def _list_conversations(conn, phone):
    rows = conn.run("SELECT conversation_id, channel, max(created_at) AS updated, count(*), "
                    "(array_agg(text ORDER BY created_at) FILTER (WHERE role = 'user'))[1] "
                    "FROM chat_messages WHERE phone = :p GROUP BY conversation_id, channel ORDER BY updated DESC LIMIT 100", p=phone)
    return 200, {"conversations": [
        {"id": str(cid), "channel": ch, "title": (first or "New chat")[:60], "updatedAt": _iso(upd), "messageCount": n}
        for cid, ch, upd, n, first in rows]}


def _me(conn, phone):
    rows = conn.run("SELECT phone, full_name, birth_date, member_number, employer, insurance, family FROM users WHERE phone = :p", p=phone)
    return 200, {"user": _user_json(rows[0])}


# ---------------------------------------------------------------- Twilio (SMS / WhatsApp)

def _twiml(text=None):
    body = f"<Message>{escape(text)}</Message>" if text else ""
    return {"statusCode": 200, "headers": {"content-type": "text/xml"}, "body": f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>'}


def _twilio_signature_ok(event, params):
    """Twilio signs the full webhook URL plus every POST field (sorted by name) with the account auth token (HMAC-SHA1, base64)."""
    if not TWILIO_AUTH_TOKEN:
        return False
    ctx = event.get("requestContext", {})
    url = TWILIO_WEBHOOK_URL or f"https://{ctx.get('domainName', '')}{event.get('rawPath', '')}"
    if event.get("rawQueryString"):
        url += "?" + event["rawQueryString"]
    data = url + "".join(k + v for k, v in sorted(params.items()))
    expected = base64.b64encode(hmac.new(TWILIO_AUTH_TOKEN.encode(), data.encode(), hashlib.sha1).digest()).decode()
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    return hmac.compare_digest(expected, headers.get("x-twilio-signature", ""))


def _twilio_sms(conn, event, raw):
    started = time.monotonic()
    params = dict(parse_qsl(raw, keep_blank_values=True))
    if not _twilio_signature_ok(event, params):
        return _respond(403, {"error": {"code": "forbidden", "message": "Bad Twilio signature.", "retryable": False}})
    sender = params.get("From", "")
    channel = "whatsapp" if sender.startswith("whatsapp:") else "sms"
    phone = sender.removeprefix("whatsapp:")
    text = params.get("Body", "").strip()
    if not PHONE_RE.match(phone) or not text:
        return _twiml()
    if text.upper() in TWILIO_KEYWORDS:  # Twilio answers STOP/HELP-style keywords itself; a second reply would double up
        return _twiml()
    if not conn.run("SELECT 1 FROM users WHERE phone = :p", p=phone):
        return _twiml("Sorry, that number isn't on a Floss plan.")
    text = text[:500]
    # One running conversation per number and channel; it starts fresh after a day of silence.
    row = conn.run("SELECT conversation_id, max(created_at) AS last FROM chat_messages WHERE phone = :p AND channel = :ch "
                   "GROUP BY conversation_id ORDER BY last DESC LIMIT 1", p=phone, ch=channel)
    if row and (time.time() - row[0][1].timestamp()) < WHATSAPP_IDLE_SECONDS:
        cid = str(row[0][0])
    else:
        cid = str(uuid.uuid4())
    answer, _ = _store_exchange(conn, phone, cid, channel, text, lambda: TWILIO_BUDGET_MS - int((time.monotonic() - started) * 1000))
    return _twiml(answer[:1500])  # WhatsApp/SMS bodies max out at 1600 characters


# ---------------------------------------------------------------- entry

def _respond(code, body):
    return {"statusCode": code, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def _route(conn, event, method, path, query, body):
    phone = _token_phone(conn, event)
    if method == "GET" and path == "/v1/me":
        return _me(conn, phone)
    if method == "GET" and path == "/v1/conversations":
        return _list_conversations(conn, phone)
    if method == "GET" and path == "/v1/messages":
        return _list_messages(conn, phone, query)
    if method == "POST" and path == "/v1/turns":
        return _post_turn(conn, phone, body)
    if method == "GET" and path.startswith("/v1/turns/"):
        return _get_turn(conn, phone, path[len("/v1/turns/"):])
    raise ApiErr(404, "not_found", "No such endpoint.")


def lambda_handler(event, context):
    global _CTX
    _CTX = context
    rid = getattr(context, "aws_request_id", None)
    http = event.get("requestContext", {}).get("http", {})
    method, path = http.get("method", "POST"), event.get("rawPath", "")
    raw = event.get("body") or ""
    if raw and event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
    if method == "POST" and path == "/v1/twilio/sms":
        try:
            conn = _connect()
            try:
                return _twilio_sms(conn, event, raw)
            finally:
                conn.close()
        except Exception:
            print("unhandled twilio error", rid, traceback.format_exc())
            return _twiml("Sorry, I'm having trouble answering right now. Please try again in a minute.")
    try:
        body = json.loads(raw) if raw else {}
        if not isinstance(body, dict):
            raise ValueError
    except ValueError:
        return _respond(400, {"error": {"code": "invalid_request", "message": "Body must be a JSON object.", "retryable": False, "requestId": rid}})
    try:
        conn = _connect()
        try:
            status, out = _route(conn, event, method, path, event.get("queryStringParameters") or {}, body)
        finally:
            conn.close()
        return _respond(status, out)
    except ApiErr as e:
        return _respond(e.status, {"error": {"code": e.code, "message": e.message, "retryable": e.retryable, "requestId": rid}})
    except Exception:
        print("unhandled error", rid, method, path, traceback.format_exc())
        return _respond(500, {"error": {"code": "server_error", "message": "Something went wrong on our side. Try again in a moment.", "retryable": True, "requestId": rid}})
