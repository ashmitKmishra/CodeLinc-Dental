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
from datetime import date, timezone

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
- PLAN HOLDER AND FAMILY says who is on the plan, with ages and member numbers. The spouse and children are priced exactly the same as the
  plan holder: for any family member quote the same rows, naming that person. Do not say their prices may differ.

You look after the wellbeing and the wallet of the employee and their family. When BENEFIT NOTES are present they come from the plan document
and override the rows: explain any limit plainly, give the corrected amounts exactly as written, and offer the practical options listed there.
Never invent plan rules beyond BENEFIT NOTES. Anything that changes how care is delivered or billed is for the dentist to decide: say "ask the
dentist or orthodontist whether it is clinically sound", never push the family toward it.

Answer ONLY from the TREATMENT ROWS provided. Rules:
- Quote dollar amounts exactly as written in the TREATMENT ROWS or BENEFIT NOTES. Never calculate, subtract, round, add, or estimate any amount.
  If a figure you would like is not written there, do not state it.
- Put every retrieved figure and hospital name in markdown bold, like **$2686.40** and **Duke University Hospital**. Use no other markdown.
- Say clearly which option is in-network, out-of-network, or cash, and name the recommended hospital for each.
- The phone number inside the rows is the patient's own number. Never tell the patient to call it.
- Do not diagnose, and do not give medical, legal or financial advice. Costs are estimates, not quotes.
- Confirm with the hospital: whenever you cannot answer from the rows (a price is not available or needs manual verification, the question is
  about a treatment, hospital or person the rows do not cover, or it is a family member's cost), never guess. Tell the patient to confirm the
  price with the hospital itself. Choose the most relevant hospital from HOSPITAL CONTACTS (the one the rows name for that treatment,
  otherwise the first listed; use that hospital's own entry only and never mix details between hospitals). If it has an email, tell them to email it, with the email in bold, and give its phone number too. If it lists no
  email, say it publishes no email for price questions and give its phone number and website. Copy contact details exactly as written in
  HOSPITAL CONTACTS; never invent or change an email, phone number or web address. Suggest what to ask, for example the price of the
  treatment with their insurance.
- Offer to write it for them: right after the contact details, volunteer help in one short sentence, such as "I can draft that email for you
  if you'd like." If the hospital has no email, offer to draft a short message or a list of questions for the call instead.
- Drafting: when the patient says yes or asks you to write the email (or message), write it ready to send. Start with "To:" (the hospital's
  email from HOSPITAL CONTACTS) and "Subject:", then a short, polite body. Name the plan holder, the insurer, the treatment, and exactly what
  to confirm (for example the cash price, or the in-network price). Include "Member ID:" with the member number of the person the treatment is for,
  copied from PLAN HOLDER AND FAMILY. Sign it with the plan holder's name. Use square-bracket placeholders for anything else you do not know,
  such as [date of birth] or [your phone number]; never invent details and never include the patient's own phone number or any dollar amount. Add one line after the draft saying to fill in the brackets before sending.
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
    vec = "[" + ",".join(f"{x:.7f}" for x in _embed(query)) + "]"
    rows = conn.run(
        "SELECT disease, doc, in_network_hospital, out_of_network_hospital, cash_cost, embedding <=> CAST(:v AS vector) AS dist "
        "FROM patient_treatment_embeddings WHERE phone = :p ORDER BY dist LIMIT :k", v=vec, p=phone, k=TOP_K)
    return [{"disease": r[0], "doc": r[1], "hospitals": [h for h in (r[2], r[3]) if h], "cash": r[4], "distance": float(r[5])} for r in rows]


# Lincoln Financial group dental terms (packages/contracts/src/plans.ts, from the plan PDF) and how the stored estimates were built
# (scripts/build_patient_treatment_vectors.py). All four people are on this plan.
ANNUAL_MAX = 1500.00            # per person per plan year; covers preventive, basic and major work; resets every January 1
ORTHO_MAX = 1500.00             # orthodontics: separate, per child under 19, LIFETIME, so it never restarts
ORTHO_AGE_LIMIT = 19
ORTHO_LIMIT_RESETS_YEARLY = False   # set True only if the real policy's orthodontic limit restarts each plan year
ALLOWED_PCT = 0.8               # allowed amount = 80% of the cash price
PREDETERMINATION_OVER = 300
TREATMENTS = {                  # disease -> (class, share the plan pays of the allowed amount)
    "braces/orthodontics": ("ortho", 0.5), "teeth cleaning": ("preventive", 1.0), "cavity/dental filling": ("basic", 0.8),
    "gum sensitivity": ("basic", 0.8), "impacted wisdom teeth": ("major", 0.5),
}


def _benefit_notes(rows, today):
    """Plan-limit facts for the best-matching treatment, computed here so the model never does arithmetic."""
    notes = []
    days_left = (date(today.year, 12, 31) - today).days
    top = rows[0]
    cls, cov = TREATMENTS.get(top["disease"], (None, None))
    try:
        cash = float(top["cash"])
    except (TypeError, ValueError):
        cash = None
    if cls and cash:
        allowed = cash * ALLOWED_PCT
        share = round(allowed * cov, 2)
        if cls == "ortho":
            notes.append(f"Braces under this Lincoln plan: it pays {cov * 100:.0f}% of the allowed amount, up to a ${ORTHO_MAX:.2f} orthodontic maximum for each "
                         f"child under {ORTHO_AGE_LIMIT}. The plan summary lists no orthodontic benefit for adults, so for a spouse or the plan holder it is worth "
                         f"asking Lincoln to confirm before booking. If no adult benefit applies, an adult pays the full cash price of ${cash:.2f}, and the "
                         f"corrected totals below apply to a child.")
            if not ORTHO_LIMIT_RESETS_YEARLY:
                notes.append(f"That ${ORTHO_MAX:.2f} is a LIFETIME maximum, separate from the ${ANNUAL_MAX:.2f} annual maximum, and it does not restart in January, "
                             f"so splitting braces across plan years does not unlock more benefit.")
            if share > ORTHO_MAX:
                notes.append(f"The plan share for braces would be ${share:.2f}, which is over the ${ORTHO_MAX:.2f} limit, so the plan would pay only ${ORTHO_MAX:.2f}. "
                             f"CORRECTED totals for the family: ${allowed - ORTHO_MAX:.2f} in-network or ${cash - ORTHO_MAX:.2f} out-of-network (cash without insurance stays "
                             f"${cash:.2f}). Quote these corrected totals instead of the in-network and out-of-network braces figures in the rows, which ignore the limit. "
                             f"Do not calculate or state any other amount.")
                if ORTHO_LIMIT_RESETS_YEARLY:
                    notes.append(f"Phasing: if the orthodontist agrees it is clinically sound, the upper arch could be done in December and the lower arch in January, "
                                 f"after the limit restarts, so the plan could pay up to ${ORTHO_MAX:.2f} in each plan year.")
                else:
                    notes.append(f"Ways to ease the cost: ask the orthodontist for a predetermination of benefits (Lincoln recommends one when you expect to pay more than "
                                 f"${PREDETERMINATION_OVER}) and for a monthly payment plan, check whether an FSA or HSA can cover the balance, and compare the in-network and "
                                 f"out-of-network quotes.")
        elif share > ANNUAL_MAX:
            notes.append(f"The plan pays at most ${ANNUAL_MAX:.2f} per person each plan year (calendar year, restarting January 1), but the plan share for this treatment "
                         f"would be ${share:.2f}. If the dentist agrees the treatment can be done in phases, the first phase before December 31 and the rest after "
                         f"January 1 would let the plan pay ${ANNUAL_MAX:.2f} now and about ${share - ANNUAL_MAX:.2f} in the new plan year.")
    if cls in ("preventive", "basic", "major") and days_left <= 120:
        notes.append(f"The ${ANNUAL_MAX:.2f} annual maximum restarts on January 1 ({days_left} days from now) and unused annual benefit is lost, so covered preventive, basic "
                     f"or major work is best scheduled before December 31.")
    return notes


def _contacts(conn, rows):
    """Contact details for the two hospitals named on the best-matching row only (in-network first). Handing the model just these keeps it
    from attaching one hospital's phone number or email to another."""
    names = list(dict.fromkeys(rows[0]["hospitals"])) if rows else []
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
    who = conn.run("SELECT full_name, insurance, family, member_number, birth_date FROM users WHERE phone = :p", p=phone)[0]
    family = who[2] if isinstance(who[2], list) else json.loads(who[2])
    today = date.today()
    age = lambda iso: today.year - int(iso[:4]) - ((today.month, today.day) < (int(iso[5:7]), int(iso[8:10])))
    family_text = "; ".join(f"{f['firstName']} {f['lastName']} ({f['relationship']}, age {age(f['birthDate'])}, member number {f.get('memberNumber', 'n/a')})" for f in family) or "none"
    holder_text = f"{who[0]} (plan holder, age {age(who[4].isoformat())}, member number {who[3] or 'n/a'})"
    notes = _benefit_notes(rows, today)
    notes_text = "\n".join(f"- {n}" for n in notes)
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
        f"- {c['name']} ({'in-network' if i == 0 else 'out-of-network'} option for {rows[0]['disease']}): "
        f"email {c['email'] or 'none published'}; phone {c['phone'] or 'none'}; website {c['url']}" for i, c in enumerate(contacts)) or "- none"
    others = ", ".join(r["disease"] for r in rows[1:]) or "none"
    messages.append({"role": "user", "content": [{"text": (
        f"PLAN HOLDER AND FAMILY: {holder_text}, insurance {who[1]}. Family on the plan: {family_text}.\n\n"
        f"TREATMENT ROWS:\n{context_text}\n\n" + (f"BENEFIT NOTES (computed from the plan document):\n{notes_text}\n\n" if notes else "") +
        f"HOSPITAL CONTACTS (use only these):\n{contact_lines}\n\n"
        f"OTHER CHECKS you can offer: {others}\n\nQUESTION: {question}")}]})
    resp = bedrock.converse(modelId=MODEL_ID, system=[{"text": SYSTEM}], messages=messages,
                            inferenceConfig={"maxTokens": 900, "temperature": 0.1})
    answer = _clean(resp["output"]["message"]["content"][0]["text"])
    bad_money = _amounts(answer) - _amounts(context_text + "\n" + notes_text)
    bad_contact = _bad_contacts(answer, contacts)
    replaced = bool(bad_money or bad_contact)
    if replaced:
        print("guardrail replaced answer", {"amounts_not_in_rows": sorted(bad_money), "contacts_not_stored": sorted(bad_contact)})
    if replaced:  # numbers and contact details must come from the stored rows, never from the model
        answer = ("I couldn't safely phrase that answer, so here are the matching estimates exactly as recorded: "
                  + " ".join(r["doc"] for r in rows[:2])
                  + (f" To confirm the price, {_contact_text(contacts[0])}. I can draft that message for you if you'd like." if contacts else "")
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
    rows = conn.run("SELECT phone, full_name, birth_date, member_number, employer, insurance, family FROM users WHERE phone = :p", p=phone)
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
