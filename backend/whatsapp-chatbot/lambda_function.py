"""AWS Lambda entry point (behind a Lambda Function URL).

Twilio POSTs to https://<function-url>/sms. The function answers Twilio immediately, then invokes
itself asynchronously with a "job" to call the model and send the reply, because Lambda freezes
as soon as it returns and a background thread would never finish.
"""
import base64
import json
import logging
import os
from urllib.parse import parse_qsl

import boto3

import bedrock
import bot

logging.getLogger().setLevel(logging.INFO)
log = logging.getLogger("sms")
_lambda = boto3.client("lambda")


def _response(status, body, content_type="text/xml"):
    return {"statusCode": status, "headers": {"Content-Type": content_type}, "body": body}


def handler(event, context):
    # Second, asynchronous invocation: do the slow part.
    if "job" in event:
        bot.answer(**event["job"])
        return {"ok": True}

    http = event.get("requestContext", {}).get("http", {})
    path = event.get("rawPath", "/")
    if http.get("method") == "GET":
        return _response(200, json.dumps({"ok": True, "models": bedrock.model_ids(), "twilio": bot.twilio is not None}),
                         "application/json")
    if http.get("method") != "POST" or path != "/sms":
        return _response(404, "not found", "text/plain")

    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode()
    params = dict(parse_qsl(body, keep_blank_values=True))

    # Twilio signs the exact URL it called: https://<function-url-host>/sms
    url = f"https://{event['requestContext']['domainName']}{path}"
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if not bot.signature_ok(url, params, headers.get("x-twilio-signature")):
        log.warning("Bad Twilio signature for %s", url)
        return _response(403, "forbidden", "text/plain")

    xml, job = bot.handle_incoming(params)
    if job:
        _lambda.invoke(FunctionName=context.function_name, InvocationType="Event",
                       Payload=json.dumps({"job": job}).encode())
    return _response(200, xml)
