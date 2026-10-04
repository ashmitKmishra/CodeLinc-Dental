# CodeLinc-Dental (Floss)

## Live site: https://d3unrkn8gkr6mk.cloudfront.net

Floss answers a plan holder's dental cost questions from their own plan data, in the app and (later) over text and WhatsApp.

## How to get in

1. Open **https://d3unrkn8gkr6mk.cloudfront.net** and choose **Sign in** (or go straight to `/signin`).
2. Enter the **mobile number on your plan**, with the country code, and your **password**.
3. Open **Chat** and ask a question, for example *"How much are braces in network?"*

Accounts are created by the team. There is no sign-up and no password reset on the page, and codes are not sent by text or email.

| Person | Mobile number to sign in with |
|---|---|
| Ashwani Mishra | `+17739986828` |
| Ashmit Mishra | `+16623524167` |
| Muhammad Ashar | `+16624978806` |
| Ibrahim Jimmi | `+15714736207` |

Passwords are not stored in this repo. Ask Ashwani for yours.

**If the page has no password box**, your browser is showing an old copy. Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows) or open it in a private window.

**If you see "That number or password isn't right"**, check the number includes `+1` and the password is typed exactly (it is case sensitive). Five or so wrong tries in a row make Cognito slow you down for a few minutes.

### Setting or changing a password (admin, needs the `workshop` AWS profile)

```bash
aws cognito-idp admin-set-user-password --profile workshop --region us-west-2 \
  --user-pool-id us-west-2_qZf7sqhYd --username +1XXXXXXXXXX --password 'NewPassword1' --permanent
```

A password needs 8 or more characters with an upper-case letter, a lower-case letter and a number. This minimum is low on purpose for the demo; raise `MinimumLength` in `backend/rag/template.yaml` before real use.

### Adding someone new

1. Add their row to `db/04_users_chat.sql` (and their treatment rows via `scripts/build_patient_treatment_vectors.py`) and load it with `scripts/load_users_chat.py`.
2. Add `{ "phone", "email" }` (plus an optional `"password"`) to `scripts/cognito_users.local.json`. The file is git-ignored because it holds contact details; the format is in `scripts/cognito_users.example.json`.
3. Run `AWS_PROFILE=workshop uv run --with boto3 python scripts/create_cognito_users.py`.

## What you can do on the site

- **Chat**: answers come from your own treatment rows only, with every dollar figure checked against those rows. Use **History** to switch between app chats and WhatsApp Messenger, or start a **New chat**. Every message is saved.
- **Overview**: your household and the Lincoln sample plan. Plan rules and usage are still sample data; the backend does not serve them yet.
- Not available yet: linking a phone for texting, confirming actions, and emailing a transcript. WhatsApp history is empty because nothing sends WhatsApp messages yet.

## How it is deployed (AWS account 435157217462, us-west-2)

```
Browser ──HTTPS──> CloudFront ──> private S3 bucket          (stack codelinc-dental-web, infra/web.yaml)
   │
   ├──HTTPS──> Cognito user pool                              (phone + password, admin-create only)
   └──HTTPS──> API Gateway (JWT authorizer) ──> Lambda ──> RDS Postgres (users, chat_messages, pgvector)
                                                  └──────> Bedrock (Titan embeddings + Claude)
                                                            (stack codelinc-dental-rag, backend/rag/template.yaml)
```

- Redeploy the website after a front-end change: `./scripts/deploy_web.sh` (needs Node and the `workshop` profile).
- Redeploy the API after a Lambda or template change: zip `backend/rag/handler.py` with `rds-global-bundle.pem` and `pg8000`, upload to the data bucket, then `aws cloudformation deploy` (steps in `md-files/backend-record.md`).
- Database changes need the admin login, which is only available through `asm-exec` (see the header of `scripts/load_users_chat.py`).
- TLS: API Gateway, Cognito and the database connection require TLS 1.2 or newer. CloudFront's default address still accepts older versions; fixing that needs a custom domain.

The RDS instance and the workshop credentials are temporary. If the site stops working, the credentials have probably expired or the instance was stopped.

## Team workflow
- `main` must always work. Never push directly to it.
- Create a branch for each task: `git checkout -b feature/<short-name>`
- Open a Pull Request into `main` and merge small changes often.

## Run it locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173, built-in sample data (mock mode)
npm run typecheck && npm test && npm run build
```

- `apps/web`: the React app. `packages/contracts`: the API contract (zod schemas), real plan fixtures from five carriers' PDFs, and JSON Schema for the backend (`npm run schema`).
- **Mock vs live:** `VITE_DATA_MODE=mock` (default) uses built-in sample data and accepts any email and password. For the live backend, copy `apps/web/.env.example` to `apps/web/.env.local` and set `VITE_DATA_MODE=live`; sign-in then uses the real accounts above.
- In mock mode, the floating **Demo** button (bottom right) switches between six real plans and between a family and one person (Lincoln, Delta Dental, Aetna, MetLife Standard and High, Cigna).
- Specs: `md-files/BUILD-BRIEF.md`, `CONTEXT.md`, `FRONTEND.md`, `BACKEND.md`. What has been built on AWS and why: `md-files/backend-record.md`.
