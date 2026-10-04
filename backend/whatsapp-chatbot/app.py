"""Local server: Twilio POSTs incoming messages to /sms; replies go out via the Twilio API.

For AWS, lambda_function.py wraps the same bot logic instead.
"""
import logging
import os
import threading

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, Response, abort, request
from werkzeug.middleware.proxy_fix import ProxyFix

import bedrock
import bot

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sms")

PUBLIC_URL = os.getenv("PUBLIC_URL", "").rstrip("/")

app = Flask(__name__)
# Behind ngrok/Render the request arrives as http://; trust X-Forwarded-* so the signature URL matches.
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)


@app.get("/")
def health():
    return {"ok": True, "models": bedrock.model_ids(), "twilio": bot.twilio is not None}


@app.post("/sms")
def sms():
    url = PUBLIC_URL + request.path if PUBLIC_URL else request.url
    if not bot.signature_ok(url, request.form, request.headers.get("X-Twilio-Signature")):
        log.warning("Bad Twilio signature for %s (set PUBLIC_URL if this keeps happening)", url)
        abort(403)

    xml, job = bot.handle_incoming(request.form)
    if job:
        # Background thread so a slow model never times out Twilio's webhook (15 s).
        threading.Thread(target=bot.answer, kwargs=job, daemon=True).start()
    return Response(xml, mimetype="text/xml")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
