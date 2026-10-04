"""Bedrock RAG Lambda: answers a patient's dental-cost question from their own rows in pgvector.

Event: {"phone": "+17739986828", "question": "How much is my filling without insurance?"}
Flow: validate phone -> embed question (Titan v2) -> pgvector search filtered to that phone -> Bedrock Converse
      explains the rows -> every $ figure in the reply must appear in the retrieved rows, otherwise return a safe fallback.
The model explains; it never computes or invents prices (md-files/BACKEND.md section 1).
"""
import json
import os
import re
import ssl

import boto3
import pg8000.native

REGION = os.environ.get("AWS_REGION", "us-west-2")
DB_HOST = os.environ["DB_HOST"]
DB_PORT = int(os.environ.get("DB_PORT", "8443"))
DB_USER = os.environ.get("DB_USER", "api_reader")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
EMBED_MODEL = "amazon.titan-embed-text-v2:0"
TOP_K = 5

rds = boto3.client("rds", region_name=REGION)
bedrock = boto3.client("bedrock-runtime", region_name=REGION)
SSL = ssl.create_default_context(cafile=os.path.join(os.path.dirname(__file__), "rds-global-bundle.pem"))
PHONE_RE = re.compile(r"^\+[1-9]\d{9,14}$")
MONEY_RE = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)")

SYSTEM = """You are Floss, a dental-benefits assistant for one plan holder.
Answer ONLY from the TREATMENT ROWS provided. Rules:
- Quote dollar amounts exactly as written in the rows. Never calculate, round, add, or estimate any amount.
- If a row says the cash price is not available or needs manual verification, say a manual check is needed. Never guess a price.
- Say clearly which option is in-network, out-of-network, or cash, and name the recommended hospital for each.
- The phone number in the rows is the patient's own number. Never tell the patient to call it or suggest a phone number.
- Do not diagnose, and do not give medical, legal or financial advice. Costs are estimates, not quotes.
- If the rows do not answer the question, say you do not have that information.
Keep it short, calm and plain-spoken."""


def _connect():
    token = rds.generate_db_auth_token(DBHostname=DB_HOST, Port=DB_PORT, DBUsername=DB_USER, Region=REGION)
    return pg8000.native.Connection(user=DB_USER, password=token, host=DB_HOST, port=DB_PORT,
                                    database="postgres", ssl_context=SSL, timeout=10)


def _embed(text):
    body = json.dumps({"inputText": text, "dimensions": 1024, "normalize": True})
    return json.loads(bedrock.invoke_model(modelId=EMBED_MODEL, body=body)["body"].read())["embedding"]


def _amounts(text):
    return {round(float(m.replace(",", "")), 2) for m in MONEY_RE.findall(text)}


def _retrieve(phone, question):
    vec = "[" + ",".join(f"{x:.7f}" for x in _embed(question)) + "]"
    conn = _connect()
    try:
        rows = conn.run(
            "SELECT disease, doc, embedding <=> CAST(:v AS vector) AS dist FROM patient_treatment_embeddings "
            "WHERE phone = :p ORDER BY dist LIMIT :k", v=vec, p=phone, k=TOP_K)
    finally:
        conn.close()
    return [{"disease": r[0], "doc": r[1], "distance": float(r[2])} for r in rows]


def _respond(code, body):
    return {"statusCode": code, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def lambda_handler(event, context):
    if isinstance(event.get("body"), str):  # API Gateway / function URL proxy shape
        event = json.loads(event["body"])
    phone = str(event.get("phone", "")).strip()
    question = str(event.get("question", "")).strip()
    if not PHONE_RE.match(phone):
        return _respond(400, {"error": "phone must be E.164, e.g. +17739986828"})
    if not question or len(question) > 500:
        return _respond(400, {"error": "question is required (max 500 characters)"})

    rows = _retrieve(phone, question)
    if not rows:
        return _respond(404, {"error": "no treatment data for this phone number"})

    context_text = "\n".join(f"- {r['doc']}" for r in rows)
    resp = bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": SYSTEM}],
        messages=[{"role": "user", "content": [{"text": f"TREATMENT ROWS:\n{context_text}\n\nQUESTION: {question}"}]}],
        inferenceConfig={"maxTokens": 400, "temperature": 0.2},
    )
    answer = resp["output"]["message"]["content"][0]["text"].strip()

    allowed = _amounts(context_text)
    bad = _amounts(answer) - allowed
    if bad:  # numbers must come from the rows, never from the model
        answer = ("I couldn't safely phrase that answer, so here are the matching estimates exactly as recorded: "
                  + " ".join(r["doc"] for r in rows[:2]))
    return _respond(200, {"answer": answer, "guardrail_replaced": bool(bad),
                          "sources": [{"disease": r["disease"], "distance": round(r["distance"], 3)} for r in rows]})
