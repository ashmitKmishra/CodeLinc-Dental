"""Amazon Bedrock calls: try the fine-tuned model first, then a stock backup model."""
import logging
import os

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)

SYSTEM_PROMPT = os.getenv(
    "SYSTEM_PROMPT",
    "You are a helpful assistant that answers over SMS. Reply in plain text with "
    "no markdown, lists or emojis. Keep every answer under 300 characters.",
)
FRIENDLY_ERROR = "Sorry, I'm having trouble answering right now. Please try again in a minute."

_client = None


def client():
    global _client
    if _client is None:
        # "standard" retries cover throttling, timeouts and ModelNotReady automatically.
        _client = boto3.client(
            "bedrock-runtime",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            config=Config(read_timeout=60, retries={"max_attempts": 3, "mode": "standard"}),
        )
    return _client


def model_ids():
    """Fine-tuned model first, Bedrock backup second, OpenAI-compatible API last. Any may be unset."""
    extra = f"openai:{os.getenv('OPENAI_MODEL')}" if os.getenv("OPENAI_API_KEY") and os.getenv("OPENAI_MODEL") else None
    return [m for m in (os.getenv("BEDROCK_MODEL_ID"), os.getenv("BEDROCK_FALLBACK_MODEL_ID"), extra) if m]


def _openai(messages):
    """Last-resort answer from any OpenAI-compatible API (OpenAI, Gemini, Groq, OpenRouter...)."""
    from openai import OpenAI

    oa = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), base_url=os.getenv("OPENAI_BASE_URL") or None, timeout=30)
    chat = [{"role": "system", "content": SYSTEM_PROMPT}] + [
        {"role": m["role"], "content": "".join(b.get("text", "") for b in m["content"])} for m in messages
    ]
    extra = {}
    if os.getenv("OPENAI_REASONING_EFFORT"):
        # Gemini 2.5 "thinking" tokens count against max_tokens and can cut replies short; "none" turns it off.
        extra["reasoning_effort"] = os.getenv("OPENAI_REASONING_EFFORT")
    resp = oa.chat.completions.create(
        model=os.getenv("OPENAI_MODEL"), messages=chat, max_tokens=int(os.getenv("MAX_TOKENS", "300")), **extra
    )
    if resp.choices[0].finish_reason == "length":
        log.warning("%s hit MAX_TOKENS; reply may be cut off", os.getenv("OPENAI_MODEL"))
    return (resp.choices[0].message.content or "").strip()


def _converse(model_id, messages, use_system):
    kwargs = {
        "modelId": model_id,
        "messages": messages,
        "inferenceConfig": {"maxTokens": int(os.getenv("MAX_TOKENS", "300")), "temperature": 0.5},
    }
    if use_system:
        kwargs["system"] = [{"text": SYSTEM_PROMPT}]
    resp = client().converse(**kwargs)
    blocks = resp["output"]["message"]["content"]
    return "".join(b.get("text", "") for b in blocks).strip()


def ask(history, text):
    """Return (reply, model_id). model_id is None when every model failed.

    history is a list of Converse messages that alternates user/assistant and starts with user.
    """
    messages = history + [{"role": "user", "content": [{"text": text}]}]
    fine_tune_system = os.getenv("BEDROCK_USE_SYSTEM_PROMPT", "true").lower() == "true"

    for i, model_id in enumerate(model_ids()):
        if model_id.startswith("openai:"):
            try:
                return _openai(messages) or "Sorry, I didn't catch that.", model_id
            except Exception as e:
                log.warning("%s failed: %s", model_id, e)
            continue
        # The backup is a stock model, so it always gets the system prompt.
        use_system = fine_tune_system if i == 0 else True
        try:
            return _converse(model_id, messages, use_system) or "Sorry, I didn't catch that.", model_id
        except ClientError as e:
            err = e.response["Error"]
            log.warning("Bedrock %s failed: %s %s", model_id, err.get("Code"), err.get("Message"))
            # Some models reject system prompts; retry the same model without one.
            if err.get("Code") == "ValidationException" and use_system and "system" in err.get("Message", "").lower():
                try:
                    return _converse(model_id, messages, False), model_id
                except (ClientError, BotoCoreError) as e2:
                    log.warning("Bedrock %s failed again without system prompt: %s", model_id, e2)
        except BotoCoreError as e:
            # Missing credentials, network errors, read timeouts.
            log.warning("Bedrock %s failed: %s", model_id, e)

    if not model_ids():
        log.error("No model configured: set BEDROCK_MODEL_ID and/or BEDROCK_FALLBACK_MODEL_ID")
    return FRIENDLY_ERROR, None


def list_models():
    """Print the fine-tuned models in this account/region and which ARN to use."""
    bedrock = boto3.client("bedrock", region_name=os.getenv("AWS_REGION", "us-east-1"))

    print("Custom models (training output; can't be called directly):")
    for m in bedrock.list_custom_models().get("modelSummaries", []):
        print(f"  {m['modelName']}  base={m.get('baseModelName') or m.get('baseModelArn')}\n    {m['modelArn']}")

    print("\nOn-demand deployments -> use customModelDeploymentArn as BEDROCK_MODEL_ID:")
    for d in bedrock.list_custom_model_deployments().get("modelDeploymentSummaries", []):
        print(f"  {d['customModelDeploymentName']}  [{d['status']}]\n    {d['customModelDeploymentArn']}")

    print("\nProvisioned Throughput (billed hourly) -> use provisionedModelArn as BEDROCK_MODEL_ID:")
    for p in bedrock.list_provisioned_model_throughputs().get("provisionedModelSummaries", []):
        print(f"  {p['provisionedModelName']}  [{p['status']}]\n    {p['provisionedModelArn']}")
