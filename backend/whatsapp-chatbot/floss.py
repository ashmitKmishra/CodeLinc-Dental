"""Floss: answers from the member's own plan data via the team's RAG Lambda (backend/rag, codelinc-dental-rag).

The bot invokes that Lambda directly (lambda:InvokeFunction) with the same event API Gateway would send for a
signed-in user, using the WhatsApp/SMS sender's number as the identity. Twilio's signature has already been checked,
so the number is the real sender. The Lambda only ever reads that number's own rows.
"""
import json
import os

FUNCTION = os.getenv("FLOSS_RAG_FUNCTION", "")
_client = None


class NotMember(Exception):
    """This phone number isn't a Floss user (not in the users table)."""


def enabled():
    return bool(FUNCTION)


def e164(phone):
    return phone.replace("whatsapp:", "")


def _invoke(phone, method, path, body=None):
    global _client
    if _client is None:
        import boto3
        from botocore.config import Config

        _client = boto3.client("lambda", config=Config(read_timeout=45, retries={"max_attempts": 1}))
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method},
                           "authorizer": {"jwt": {"claims": {"token_use": "id", "phone_number": e164(phone)}}}},
        "body": json.dumps(body) if body else None,
        "queryStringParameters": {},
    }
    out = json.loads(_client.invoke(FunctionName=FUNCTION, Payload=json.dumps(event).encode())["Payload"].read())
    status, data = out.get("statusCode"), json.loads(out.get("body") or "{}")
    if status == 403:
        raise NotMember(phone)
    if status != 200:
        raise RuntimeError(f"Floss {method} {path} -> {status}: {data}")
    return data


def profile(phone):
    """The member's record (name, insurance, member number, family). Raises NotMember."""
    return _invoke(phone, "GET", "/v1/me")["user"]


def ask(phone, text, conversation_id=None):
    """Return (reply, conversation_id). Continues conversation_id when it is still valid. Raises NotMember."""
    body = {"text": text[:500]}
    try:
        turn = _invoke(phone, "POST", "/v1/turns", {**body, "conversationId": conversation_id} if conversation_id else body)
    except RuntimeError:
        if not conversation_id:
            raise
        turn = _invoke(phone, "POST", "/v1/turns", body)  # old thread can't be continued: start a new one
    reply = _invoke(phone, "GET", f"/v1/turns/{turn['turnId']}")["reply"]["text"]
    return reply, turn["conversationId"]
