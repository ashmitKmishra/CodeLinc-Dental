"""Chatbot logic shared by the local Flask server (app.py) and AWS Lambda (lambda_function.py)."""
import logging
import os
import re
import time
from collections import defaultdict, deque

from dotenv import load_dotenv

load_dotenv()

from twilio.request_validator import RequestValidator
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse

import bedrock
import floss
import history

logging.getLogger("twilio.http_client").setLevel(logging.WARNING)
log = logging.getLogger("sms")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_API_KEY = os.getenv("TWILIO_API_KEY", "")
TWILIO_API_SECRET = os.getenv("TWILIO_API_SECRET", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
VALIDATE_SIGNATURE = os.getenv("TWILIO_VALIDATE_SIGNATURE", "true").lower() == "true"
ALLOWED_NUMBERS = {n.strip() for n in os.getenv("ALLOWED_NUMBERS", "").split(",") if n.strip()}
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "5"))
HISTORY_TURNS = int(os.getenv("HISTORY_TURNS", "6"))
MAX_SMS_CHARS = 1500  # Twilio's limit is 1600; it splits long bodies into segments itself.

# Twilio answers STOP/HELP-style keywords itself, so we stay silent on them to avoid double replies.
TWILIO_KEYWORDS = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "START", "UNSTOP", "YES", "HELP", "INFO"}

# Send with a revocable API key when set; the Auth Token is still needed to validate webhook signatures.
if TWILIO_ACCOUNT_SID and TWILIO_API_KEY and TWILIO_API_SECRET:
    twilio = Client(TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_ACCOUNT_SID)
elif TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    twilio = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
else:
    twilio = None
validator = RequestValidator(TWILIO_AUTH_TOKEN)
_recent = defaultdict(deque)


def twiml(text=None):
    resp = MessagingResponse()
    if text:
        resp.message(text)
    return str(resp)


def signature_ok(url, params, signature):
    return not VALIDATE_SIGNATURE or validator.validate(url, params, signature or "")


def rate_limited(phone):
    now = time.time()
    q = _recent[phone]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_MINUTE:
        return True
    q.append(now)
    return False


def handle_incoming(params):
    """Decide what to do with an incoming Twilio webhook.

    Returns (twiml_xml, job). job is None, or a dict to pass to answer() in the background.
    """
    phone = params.get("From", "")
    text = params.get("Body", "").strip()
    command = text.upper()

    if ALLOWED_NUMBERS and phone not in ALLOWED_NUMBERS:
        log.info("Ignoring %s (not in ALLOWED_NUMBERS)", phone[-4:])
        return twiml(), None
    if not text or command in TWILIO_KEYWORDS:
        return twiml(), None
    if command == "RESET":
        history.clear(phone)
        return twiml("Conversation cleared. Ask me anything."), None
    if rate_limited(phone):
        return twiml("You're sending messages too fast. Please wait a minute."), None
    return twiml(), {"phone": phone, "text": text, "bot_number": params.get("To")}


GREETING = re.compile(r"^(hi+|hello|hey+|hiya|yo|good (morning|afternoon|evening)|start|menu|help me|"
                      r"who are you|what can you do|what do you do)\W*$", re.I)


def intro(phone):
    """Floss's introduction, personalised when the number belongs to a member."""
    first = ""
    if floss.enabled():
        try:
            first = " " + floss.profile(phone)["name"].split()[0]
        except floss.NotMember:
            return ("Hi! I'm Floss AI, the dental assistant for Lincoln Financial employees. I couldn't find a Lincoln "
                    "dental plan linked to this number, so I can only share general dental information. Ask me about any "
                    "procedure, or contact your HR benefits team to link your number.")
        except Exception:
            log.exception("Floss profile lookup failed")
    return (f"Hi{first}! I'm Floss AI, the dental assistant for Lincoln Financial employees. I can help with:\n"
            "- Procedure info: what a treatment involves and what it would cost you\n"
            "- Plan maximums: your annual and orthodontic limits and how much a treatment would use\n"
            "- Your current plan details, family coverage and in-network hospitals\n"
            "What would you like to know?")


def format_for(to, text):
    """WhatsApp bolds *text*; SMS shows asterisks literally, so drop them there."""
    if to.startswith("whatsapp:"):
        return re.sub(r"\*\*(.+?)\*\*", r"*\1*", text)
    return text.replace("**", "")


def chunks(text, limit=MAX_SMS_CHARS):
    """Split long answers on paragraph breaks so nothing is cut off."""
    parts, current = [], ""
    for para in text.split("\n\n"):
        if current and len(current) + 2 + len(para) > limit:
            parts.append(current)
            current = ""
        while len(para) > limit:
            parts.append(para[:limit])
            para = para[limit:]
        current = f"{current}\n\n{para}" if current else para
    return parts + [current] if current else parts


def send_sms(to, body, from_=None):
    for part in chunks(format_for(to, body)):
        if twilio is None:
            log.info("[dry run, no Twilio credentials] to %s: %s", to, part)
            continue
        twilio.messages.create(from_=from_ or TWILIO_PHONE_NUMBER, to=to, body=part)


def answer(phone, text, bot_number=None):
    """Answer and text the reply. Runs after the webhook has already responded to Twilio.

    Order: greeting -> Floss (member's own plan data) -> Bedrock general answer (non-members, or if Floss fails).
    """
    try:
        reply, model, conversation_id = None, None, None
        if GREETING.match(text.strip()):
            reply, model = intro(phone), "intro"
        elif floss.enabled():
            try:
                reply, conversation_id = floss.ask(phone, text, history.last_conversation(phone))
                model = "floss-rag"
            except floss.NotMember:
                pass
            except Exception:
                log.exception("Floss failed for %s; answering with Bedrock instead", phone[-4:])
        if reply is None:
            reply, model = bedrock.ask(history.get(phone, HISTORY_TURNS), text)
        if model:  # only store successful exchanges so history keeps alternating user/assistant
            history.add_turn(phone, text, reply, model, conversation_id)
        log.info("%s via %s: %r -> %r", phone[-4:], model, text, reply)
        # Reply from the number the user texted, so one server can serve several Twilio numbers.
        send_sms(phone, reply, bot_number)
    except Exception:
        log.exception("Failed to answer %s", phone[-4:])
