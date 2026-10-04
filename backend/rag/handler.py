"""Floss API Lambda behind API Gateway (HTTP API): chat history and Bedrock RAG over the caller's own rows.

Sign-in is Amazon Cognito (one-time code by SMS or email, no passwords). API Gateway's JWT authorizer validates the Cognito ID
token before this code runs; the verified `phone_number` claim is the caller's identity.

Routes (all JSON, all need "Authorization: Bearer <Cognito ID token>"):
  GET  /v1/me                              -> the signed-in user and family
  GET  /v1/conversations                   -> chat threads, newest first, each tagged with its channel (app / whatsapp / ...)
  GET  /v1/messages?conversationId=&limit= -> one thread's messages, oldest first (all threads when conversationId is omitted)
  POST /v1/turns        {"text","conversationId"?} -> runs RAG now, stores both messages, returns {"turnId","conversationId"};
                                               no conversationId = "New chat"
  GET  /v1/turns/{id}                      -> {"id","status":"completed","reply": Message}
The phone always comes from the verified token, never the request, so one patient can never read another's rows.

RAG flow: embed question (Titan v2) -> pgvector search filtered to that phone -> Bedrock Converse explains the rows ->
every $ figure in the reply must appear in the retrieved rows, otherwise return a safe fallback.
The model explains; it never computes or invents prices (md-files/BACKEND.md section 1).
"""
import base64
import json
import os
import re
import ssl
import traceback
import uuid
from datetime import timezone

import boto3
import pg8000.native

REGION = os.environ.get("AWS_REGION", "us-west-2")
DB_HOST = os.environ["DB_HOST"]
DB_PORT = int(os.environ.get("DB_PORT", "8443"))
DB_USER = os.environ.get("DB_USER", "api_app")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
EMBED_MODEL = "amazon.titan-embed-text-v2:0"
TOP_K = 5
HISTORY_TURNS = 20  # messages (10 exchanges) of this chat replayed to the model

rds = boto3.client("rds", region_name=REGION)
bedrock = boto3.client("bedrock-runtime", region_name=REGION)
SSL = ssl.create_default_context(cafile=os.path.join(os.path.dirname(__file__), "rds-global-bundle.pem"))
SSL.minimum_version = ssl.TLSVersion.TLSv1_2  # never fall back below TLS 1.2 to the database
PHONE_RE = re.compile(r"^\+[1-9]\d{9,14}$")
MONEY_RE = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
US_PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[-. ]?)?\(?(\d{3})\)?[-. ]?(\d{3})[-. ]?(\d{4})(?!\d)")
URL_RE = re.compile(r"https?://[^\s*)>\]]+")
EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\u2300-\u23FF\uFE0F\u200D]")

SYSTEM = """You are Floss, a warm, upbeat dental-benefits assistant for one plan holder and their family. Be cheerful and proactive: open with a
friendly line and volunteer the most useful next fact from the rows (for example the cheaper of in-network and out-of-network). Never use emojis.

Memory:
- This is one continuing chat. Earlier messages are real context: remember what the patient told you (who needs which treatment, which hospital
  they prefer) and use it. A short follow-up such as "what about out of network?" or "and for my son?" continues the topic of the previous
  question. Never ask the patient to repeat something they already said.
- PLAN HOLDER AND FAMILY says who is on the plan. The treatment rows are the plan holder's estimates. If the patient asks about a family
  member, give the same rows as a starting point, say plainly that these are the plan holder's estimates and that a family member's cost can
  differ, and suggest confirming with the hospital.

Answer ONLY from the TREATMENT ROWS provided. Rules:
- Quote dollar amounts exactly as written in the rows. Never calculate, round, add, or estimate any amount.
- Put every retrieved figure and hospital name in markdown bold, like **$2686.40** and **Duke University Hospital**. Use no other markdown.
- Say clearly which option is in-network, out-of-network, or cash, and name the recommended hospital for each.
- The phone number inside the rows is the patient's own number. Never tell the patient to call it.
- Do not diagnose, and do not give medical, legal or financial advice. Costs are estimates, not quotes.
- Confirm with the hospital: whenever you cannot answer from the rows (a price is not available or needs manual verification, the question is
  about a treatment, hospital or person the rows do not cover, or it is a family member's cost), never guess. Tell the patient to confirm the
  price with the hospital itself. Choose the most relevant hospital from HOSPITAL CONTACTS (the one the rows name for that treatment,
  otherwise the first listed). If it has an email, tell them to email it, with the email in bold, and give its phone number too. If it lists no
  email, say it publishes no email for price questions and give its phone number and website. Copy contact details exactly as written in
  HOSPITAL CONTACTS; never invent or change an email, phone number or web address. Suggest what to ask, for example the price of the
  treatment with their insurance.
- ALWAYS end with exactly one closing question, worded "Would you also be interested in something similar to be checked, such as <one check>?",
  where <one check> comes from the OTHER CHECKS list (prefer one not already discussed). Put no dollar amounts in it.
Keep it short."""


class ApiErr(Exception):
    def __init__(self, status, code, message, retryable=False):
        super().__init__(message)
        self.status, self.code, self.message, self.retryable = status, code, message, retryable


def _connect():
    token = rds.generate_db_auth_token(DBHostname=DB_HOST, Port=DB_PORT, DBUsername=DB_USER, Region=REGION)
    return pg8000.native.Connection(user=DB_USER, password=token, host=DB_HOST, port=DB_PORT,
                                    database="postgres", ssl_context=SSL, timeout=10)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _embed(text):
    body = json.dumps({"inputText": text, "dimensions": 1024, "normalize": True})
    return json.loads(bedrock.invoke_model(modelId=EMBED_MODEL, body=body)["body"].read())["embedding"]


def _amounts(text):
    return {round(float(m.replace(",", "")), 2) for m in MONEY_RE.findall(text)}


def _user_json(row):
    phone, name, birth_date, employer, insurance, family = row
    return {"phone": phone, "name": name, "birthDate": birth_date.isoformat(), "employer": employer, "insurance": insurance,
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
    vec = "[" + ",".join(f"{x:.7f}" for x in _embed(query)) + "]"
    rows = conn.run(
        "SELECT disease, doc, in_network_hospital, out_of_network_hospital, embedding <=> CAST(:v AS vector) AS dist "
        "FROM patient_treatment_embeddings WHERE phone = :p ORDER BY dist LIMIT :k", v=vec, p=phone, k=TOP_K)
    return [{"disease": r[0], "doc": r[1], "hospitals": [h for h in (r[2], r[3]) if h], "distance": float(r[4])} for r in rows]


def _contacts(conn, rows):
    """Contact details for the hospitals named in the rows, in the order the rows name them."""
    names = list(dict.fromkeys(h for r in rows for h in r["hospitals"]))
    if not names:
        return []
    found = {n: (e, ph, u) for n, e, ph, u in conn.run(
        "SELECT name, email, phone, info_url FROM hospital_contacts WHERE name = ANY(CAST(:n AS text[]))", n=names)}
    return [{"name": n, "email": found[n][0], "phone": found[n][1], "url": found[n][2]} for n in names if n in found]


def _contact_text(c):
    if c["email"]:
        return f"email {c['name']} at {c['email']} or call {c['phone']}" if c["phone"] else f"email {c['name']} at {c['email']}"
    return f"{c['name']} publishes no email for price questions: call {c['phone'] or 'its main number'} or see {c['url']}"


def _clean(text):
    text = EMOJI_RE.sub("", text)
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"[ \t]{2,}", " ", text)).strip()


def _bad_contacts(answer, contacts):
    """Emails, phone numbers and links in the answer that are not exactly the stored contact details."""
    ok_emails = {c["email"].lower() for c in contacts if c["email"]}
    ok_phones = {re.sub(r"\D", "", c["phone"])[-10:] for c in contacts if c["phone"]}
    ok_urls = {c["url"].rstrip("/").lower() for c in contacts}
    bad = {e for e in EMAIL_RE.findall(answer) if e.lower().rstrip(".") not in ok_emails}
    bad |= {"".join(m) for m in US_PHONE_RE.findall(answer) if "".join(m) not in ok_phones}
    bad |= {u for u in URL_RE.findall(answer) if u.rstrip("/.,;:").lower() not in ok_urls}
    return bad


def _answer(conn, phone, conversation_id, question):
    history = conn.run("SELECT role, text FROM chat_messages WHERE phone = :p AND conversation_id = CAST(:c AS uuid) "
                       "AND role IN ('user','assistant') ORDER BY created_at DESC LIMIT :n",
                       p=phone, c=conversation_id, n=HISTORY_TURNS)[::-1]
    # The newest history row is the question just stored. Short follow-ups ("what about out of network?") only make sense with the
    # earlier questions, so the search uses the last two of those as well.
    earlier_questions = [t for r, t in history if r == "user"][:-1]
    rows = _retrieve(conn, phone, " ".join(earlier_questions[-2:] + [question]))
    if not rows:
        return "I don't have treatment estimates on file for you yet.", [], False
    contacts = _contacts(conn, rows)
    who = conn.run("SELECT full_name, insurance, family FROM users WHERE phone = :p", p=phone)[0]
    family = who[2] if isinstance(who[2], list) else json.loads(who[2])
    family_text = ", ".join(f"{f['firstName']} {f['lastName']} ({f['relationship']})" for f in family) or "none"
    messages = []
    for role, text in history:  # Converse needs alternating roles starting with user
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"][0]["text"] += "\n" + text
        elif messages or role == "user":
            messages.append({"role": role, "content": [{"text": text}]})
    if messages and messages[-1]["role"] == "user":
        messages.pop()
    context_text = "\n".join(f"- {r['doc']}" for r in rows)
    contact_lines = "\n".join(
        f"- {c['name']}: email {c['email'] or 'none published'}; phone {c['phone'] or 'none'}; website {c['url']}" for c in contacts) or "- none"
    others = ", ".join(r["disease"] for r in rows[1:]) or "none"
    messages.append({"role": "user", "content": [{"text": (
        f"PLAN HOLDER AND FAMILY: {who[0]}, insurance {who[1]}. Family on the plan: {family_text}.\n\n"
        f"TREATMENT ROWS:\n{context_text}\n\nHOSPITAL CONTACTS (use only these):\n{contact_lines}\n\n"
        f"OTHER CHECKS you can offer: {others}\n\nQUESTION: {question}")}]})
    resp = bedrock.converse(modelId=MODEL_ID, system=[{"text": SYSTEM}], messages=messages,
                            inferenceConfig={"maxTokens": 600, "temperature": 0.2})
    answer = _clean(resp["output"]["message"]["content"][0]["text"])
    bad_money = _amounts(answer) - _amounts(context_text)
    bad_contact = _bad_contacts(answer, contacts)
    replaced = bool(bad_money or bad_contact)
    if replaced:  # numbers and contact details must come from the stored rows, never from the model
        answer = ("I couldn't safely phrase that answer, so here are the matching estimates exactly as recorded: "
                  + " ".join(r["doc"] for r in rows[:2])
                  + (f" To confirm the price, {_contact_text(contacts[0])}." if contacts else "")
                  + " Would you also be interested in something similar to be checked?")
    if "similar to be checked" not in answer.lower():  # the closing offer is guaranteed, whatever the model did
        fresh = [r["disease"] for r in rows[1:] if r["disease"].split("/")[0].lower() not in answer.lower()] or [r["disease"] for r in rows[1:]]
        answer += "\n\nWould you also be interested in something similar to be checked" + (f", such as {fresh[0]}?" if fresh else "?")
    return answer, [{"disease": r["disease"], "distance": round(r["distance"], 3)} for r in rows], replaced


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
    # Stored first so the chat shows it while the answer is generated; _answer drops it from the history it replays.
    conn.run("INSERT INTO chat_messages (phone, conversation_id, role, text) VALUES (:p, CAST(:c AS uuid), 'user', :t)", p=phone, c=cid, t=text)
    answer, sources, replaced = _answer(conn, phone, cid, text)
    rid = conn.run("INSERT INTO chat_messages (phone, conversation_id, role, text, sources, guardrail_replaced) "
                   "VALUES (:p, CAST(:c AS uuid), 'assistant', :t, CAST(:s AS jsonb), :g) RETURNING id",
                   p=phone, c=cid, t=answer, s=json.dumps(sources), g=replaced)[0][0]
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
    rows = conn.run("SELECT phone, full_name, birth_date, employer, insurance, family FROM users WHERE phone = :p", p=phone)
    return 200, {"user": _user_json(rows[0])}


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
    rid = getattr(context, "aws_request_id", None)
    http = event.get("requestContext", {}).get("http", {})
    method, path = http.get("method", "POST"), event.get("rawPath", "")
    raw = event.get("body") or ""
    if raw and event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
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
