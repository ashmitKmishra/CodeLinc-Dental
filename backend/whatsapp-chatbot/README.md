# SMS ↔ Bedrock bridge

Text a phone number, get an answer from a fine-tuned Amazon Bedrock model. No app or mobile data needed.

```
phone --SMS--> Twilio --POST /sms--> app.py --Converse--> Bedrock (fine-tune, then backup model)
phone <--SMS-- Twilio <--messages.create-- (background thread)
```

| File | What it does |
|---|---|
| `bot.py` | Shared logic: allowlist, rate limit, RESET, asking the model, sending the reply from the number that was messaged. |
| `app.py` | Local Flask server. Validates Twilio's signature, replies instantly with empty TwiML, answers in a background thread. |
| `lambda_function.py` / `deploy.py` | The same bot on AWS Lambda, and a one-command deploy script (see below). |
| `bedrock.py` | Calls the fine-tuned model, falls back to a stock model, always returns *something* to text back. |
| `history.py` | Per-number chat history in SQLite (`chat.db`). Also your log for evaluating the fine-tune. |
| `chat.py` | Talk to the model from the terminal, no Twilio needed. Also lists your fine-tuned model ARNs. |

## Floss AI: answers from the member's own plan

With `FLOSS_RAG_FUNCTION=codelinc-dental-rag`, the bot answers as Floss AI, the dental assistant for Lincoln employees:

- "hi", "who are you" and similar get a personalised introduction (procedure info, plan maximums, current plan details).
- Questions from a number in the `users` table go to the team's RAG Lambda (`backend/rag`), which answers only from that member's own rows: plan, family, treatment estimates, hospitals. `floss.py` invokes it directly with the sender's number as the identity (Twilio's signature has already been checked), so WhatsApp users don't sign in with Cognito. The team agreed to this trust model for the hackathon.
- Follow-ups continue the same Floss conversation; `RESET` starts a new one. Messages are stored in `chat_messages` like app chats.
- Numbers not in `users`, or any Floss error, fall back to a general Bedrock answer that never invents personal prices.
- Not available yet: how much of the annual maximum a member has already used (no claims data in the database).

## How it stays working

1. Fine-tuned model (`BEDROCK_MODEL_ID`). Throttling, timeouts and "model not ready" are retried automatically.
2. If it rejects the system prompt, it's retried without one.
3. If it still fails (or isn't set yet), the backup model (`BEDROCK_FALLBACK_MODEL_ID`) answers.
4. If Bedrock fails and `OPENAI_API_KEY` + `OPENAI_MODEL` are set, any OpenAI-compatible API answers (OpenAI, Gemini, Groq, OpenRouter).
5. If everything fails, the user gets a "try again in a minute" text instead of silence.

So you can demo on the backup model today and drop in the fine-tune ARN when it's ready.

## Setup

```bash
source .venv/bin/activate      # already created; otherwise: python3.12 -m venv .venv && pip install -r requirements.txt
cp .env.example .env           # then fill it in
```

### 1. Bedrock first (no Twilio needed)

Give boto3 credentials, any one of:
- `aws configure` (install with `brew install awscli`), or
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in `.env` (IAM user with `bedrock:InvokeModel`), or
- `AWS_BEARER_TOKEN_BEDROCK` in `.env` (a Bedrock API key from the Bedrock console).

```bash
python chat.py --models        # find your deployment / provisioned throughput ARN
python chat.py "hello"         # one-shot test; shows which model answered
python chat.py                 # interactive, checks replies stay short
```

Put the ARN in `BEDROCK_MODEL_ID`. A plain custom-model ARN won't work. It must be a **custom model deployment** ARN (on-demand) or a **Provisioned Throughput** ARN, in the same `AWS_REGION`.
If the fine-tune does worse with the system prompt, set `BEDROCK_USE_SYSTEM_PROMPT=false`.

### 2. Twilio

1. Put Account SID, Auth Token and your Twilio number in `.env`.
2. Trial account: add every tester's phone under **Phone Numbers → Verified Caller IDs**.
3. Run the server and a tunnel:
   ```bash
   python app.py                  # port 8080 (macOS AirPlay uses 5000)
   ngrok http 8080
   ```
4. **Phone Numbers → Active numbers → your number → Messaging Configuration**:
   "A message comes in" → Webhook → `https://<ngrok-host>/sms` → HTTP POST → Save.
5. Text the number. Send `RESET` to start over.

Getting 403s? Set `PUBLIC_URL=https://<ngrok-host>` in `.env`. It must exactly match the URL configured in Twilio.

### WhatsApp instead of SMS (works today, no carrier registration)

The same `/sms` endpoint handles WhatsApp; only `.env` changes.

1. Twilio Console → Messaging → Try it out → Send a WhatsApp message. From your phone, WhatsApp the join code (e.g. `join <two-words>`) to the sandbox number +1 415 523 8886.
2. `.env`: `TWILIO_PHONE_NUMBER=whatsapp:+14155238886` and `ALLOWED_NUMBERS=whatsapp:+1<your number>`.
3. Sandbox settings → "When a message comes in" → `https://<tunnel>/sms`, POST, Save.
4. Message the sandbox. Replies are free-form for 24 hours after your last message; re-send the join code if the sandbox goes quiet for ~3 days.

No Bedrock access yet? Set `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (e.g. Gemini, see `.env.example`) and leave the Bedrock model IDs blank.

Tunnel: if your network blocks ngrok/cloudflared, `ssh -p 443 -R0:localhost:8080 free.pinggy.io` (press Enter at the password prompt; free URLs expire after 60 min).

### Test the webhook without Twilio

Set `TWILIO_VALIDATE_SIGNATURE=false` and leave the Twilio creds blank (replies are logged instead of sent):

```bash
curl -X POST localhost:8080/sms -d From=+15551234567 -d Body="What is photosynthesis?"
```

## Deploy to AWS Lambda (permanent URL, no laptop needed)

```bash
python deploy.py
```

It creates (or updates) everything in `AWS_REGION` and prints the URL to paste into Twilio:

| Resource | Purpose |
|---|---|
| Lambda `whatsapp-chatbot` + Function URL | `lambda_function.py`: answers Twilio instantly, then invokes itself in the background to call the model and send the reply |
| DynamoDB `whatsapp-chatbot-history` | Chat history per number (on-demand billing, free at hackathon volume) |
| IAM role `whatsapp-chatbot-role` | Lets the function call Bedrock, DynamoDB and CloudWatch Logs, so no AWS keys live in the function |

- Your local AWS credentials are only used to deploy, and need permission to create IAM roles, Lambda functions and DynamoDB tables. Temporary hackathon credentials work: put `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` in `.env`.
- Twilio and model settings are copied from `.env` into the function's environment variables. After changing `.env`, run `python deploy.py` again; the URL stays the same.
- Deploy in the same region as your fine-tuned model deployment.
- Logs: CloudWatch → Log groups → `/aws/lambda/whatsapp-chatbot`.

Other hosts (Render / Railway): the `Procfile` runs gunicorn with `app.py`. Set `PUBLIC_URL` to the service URL and keep one worker.

## Before the public can text it

- Allowlist during the demo: `ALLOWED_NUMBERS=+1555...,+1555...`
- Trial accounts can only text verified numbers and prefix every reply with a trial notice.
- Upgrade and register: A2P 10DLC for a US local number, or toll-free verification. Either can take days.
- Twilio handles STOP/HELP itself; the app stays silent on those keywords.
- If you used Provisioned Throughput, **delete it after the demo**. It bills hourly.

## Read the logs for evaluation

```bash
sqlite3 chat.db "select datetime(ts,'unixepoch'), substr(phone,-4), model, user_text, reply from turns order by ts"
```
