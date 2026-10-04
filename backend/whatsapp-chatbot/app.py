"""SMS <-> Amazon Bedrock bridge. Twilio POSTs incoming texts to /sms; replies go out via the Twilio API."""
import logging
import os
import threading
import time
from collections import defaultdict, deque

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, Response, abort, request
from twilio.request_validator import RequestValidator
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse
from werkzeug.middleware.proxy_fix import ProxyFix

import bedrock
import history

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.getLogger("twilio.http_client").setLevel(logging.WARNING)
log = logging.getLogger("sms")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
PUBLIC_URL = os.getenv("PUBLIC_URL", "").rstrip("/")
VALIDATE_SIGNATURE = os.getenv("TWILIO_VALIDATE_SIGNATURE", "true").lower() == "true"
ALLOWED_NUMBERS = {n.strip() for n in os.getenv("ALLOWED_NUMBERS", "").split(",") if n.strip()}
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "5"))
HISTORY_TURNS = int(os.getenv("HISTORY_TURNS", "6"))
MAX_SMS_CHARS = 1500  # Twilio's limit is 1600; it splits long bodies into segments itself.

# Twilio answers STOP/HELP-style keywords itself, so we stay silent on them to avoid double replies.
TWILIO_KEYWORDS = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "START", "UNSTOP", "YES", "HELP", "INFO"}

app = Flask(__name__)
# Behind ngrok/Render the request arrives as http://; trust X-Forwarded-* so the signature URL matches.
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

twilio = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN else None
validator = RequestValidator(TWILIO_AUTH_TOKEN)
_recent = defaultdict(deque)


def twiml(text=None):
    resp = MessagingResponse()
    if text:
        resp.message(text)
    return Response(str(resp), mimetype="text/xml")


def rate_limited(phone):
    now = time.time()
    q = _recent[phone]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_MINUTE:
        return True
    q.append(now)
    return False


def send_sms(to, body):
    body = body[:MAX_SMS_CHARS]
    if twilio is None:
        log.info("[dry run, no Twilio credentials] to %s: %s", to, body)
        return
    twilio.messages.create(from_=TWILIO_PHONE_NUMBER, to=to, body=body)


def answer(phone, text):
    """Runs in a background thread so a slow model never times out Twilio's webhook (15 s)."""
    try:
        reply, model = bedrock.ask(history.get(phone, HISTORY_TURNS), text)
        if model:  # only store successful exchanges so history keeps alternating user/assistant
            history.add_turn(phone, text, reply, model)
        log.info("%s via %s: %r -> %r", phone[-4:], model, text, reply)
        send_sms(phone, reply)
    except Exception:
        log.exception("Failed to answer %s", phone[-4:])


@app.get("/")
def health():
    return {"ok": True, "models": bedrock.model_ids(), "twilio": twilio is not None}


@app.post("/sms")
def sms():
    if VALIDATE_SIGNATURE:
        url = PUBLIC_URL + request.path if PUBLIC_URL else request.url
        if not validator.validate(url, request.form, request.headers.get("X-Twilio-Signature", "")):
            log.warning("Bad Twilio signature for %s (set PUBLIC_URL if this keeps happening)", url)
            abort(403)

    phone = request.form.get("From", "")
    text = request.form.get("Body", "").strip()
    command = text.upper()

    if ALLOWED_NUMBERS and phone not in ALLOWED_NUMBERS:
        log.info("Ignoring %s (not in ALLOWED_NUMBERS)", phone[-4:])
        return twiml()
    if not text or command in TWILIO_KEYWORDS:
        return twiml()
    if command == "RESET":
        history.clear(phone)
        return twiml("Conversation cleared. Ask me anything.")
    if rate_limited(phone):
        return twiml("You're sending messages too fast. Please wait a minute.")

    threading.Thread(target=answer, args=(phone, text), daemon=True).start()
    return twiml()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
