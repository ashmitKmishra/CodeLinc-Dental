# Record: what's been done (2026-10-03)

Branch: `ashwani/tale-of-threeDatasets`. Goal of this slice: three dental datasets in AWS RDS for the employee dental-plan pipeline (iMessage and dashboard -> vector DB with in-network vs out-of-network cost summaries).

## Datasets (SQL in `db/`)

| File | Table | Rows | Notes |
|---|---|---|---|
| `01_patients.sql` | `patients` | 10 | Fictional employees. Columns: employer, `insurance` (Lincoln Financial, Delta Dental, MetLife, Cigna, Aetna), `has_family`, `family_members` (e.g. `spouse, daughter`). Lincoln Financial on 3 patients. Phones use the reserved 555-01xx range. |
| `02_nc_hospitals.sql` | `nc_hospitals` | 30 | Real NC hospital names, city and system. One column per insurer: `in-network` or `out-of-network`. **Network values are random placeholders, not accurate.** |
| `03_nc_dental_costs.sql` | `nc_dental_costs` | 30 | Supplied by the team (CDT code, low/avg/high cost, basis, source). Also creates the `api_reader` IAM-auth role with read access to this table. |

Each file drops and rebuilds its table, so it is safe to re-run.

## AWS setup (workshop account 435157217462, us-west-2)

The first account (010319218313, us-east-2) was abandoned: Bedrock was blocked pending account verification. Everything was rebuilt in the workshop account. The workshop role is limited, for example `s3vectors:*` is denied.

- Tooling: AWS CLI v2, `uv`, Agent Toolkit. Credentials are temporary workshop keys in profile `workshop` in `~/.aws/credentials`, region `us-west-2`. They expire after a few hours, so re-copy them from "Get AWS CLI credentials".
- RDS instance `codelinc-dental`: Postgres, `db.t4g.micro`, 20 GB, encrypted, IAM auth on, public, **port 8443**. Database `postgres`, schema `public`. Admin `dbadmin`, password in Secrets Manager (managed). Fetch it only through `asm-exec` references. Never call `get-secret-value`.
- Security group `codelinc-dental-rds`: inbound 8443 from the developer IP /32 only.
- Tables loaded by `scripts/load_tables.py`: 10 / 30 / 30 rows. `api_reader` (IAM auth, read-only) is created by `03_nc_dental_costs.sql`; it has **not** been granted `patients` or `nc_hospitals` in this account yet.
- Bedrock: Titan Text Embeddings v2 (`amazon.titan-embed-text-v2:0`) works. Gemini is not in Bedrock; Gemma models cannot embed.

## Patient treatment table and vectors

- S3 bucket `codelinc-dental-data-435157217462-us-west-2`, key `tables/patient_treatment_costs.csv`: 20 rows (4 people x 5 conditions), 8 columns: phone, name, disease, in-network cost, in-network hospital, out-of-network cost, out-of-network hospital, cash cost. Phone alone cannot be a primary key (5 rows per phone), so the key is (phone, disease).
- Ashwani Mishra / cavity-dental filling: cash cost is "Needs manual verification" (no generated number).
- Vectors: pgvector table `patient_treatment_embeddings` on the RDS instance (1024-dim, cosine HNSW index, PK phone+disease). S3 Vectors was denied for the workshop role.
- Assumptions: all four people are on Lincoln Financial. Hospitals come from Lincoln's in-network and out-of-network lists in `nc_hospitals`. Cash cost is the average from `nc_dental_costs` (braces D8090, cleaning D1110, filling D2391, gum D4346, wisdom teeth D7240). Insurance math: allowed amount = 80% of cash; plan pays preventive 100%, basic 80%, major and ortho 50%. In-network patient pays allowed minus plan share. Out-of-network patient pays cash minus plan share. Orthodontic lifetime maximums are ignored.
- Rebuild: `scripts/build_patient_treatment_vectors.py` (safe to rerun).

## RAG Lambda (`backend/rag/`)

- CloudFormation stack `codelinc-dental-rag` (`template.yaml`): Lambda `codelinc-dental-rag` (python3.12, arm64, 30 s, in the RDS VPC), a `bedrock-runtime` interface VPC endpoint (the VPC has no NAT), a security-group rule letting only the Lambda reach RDS on 8443, and a least-privilege role (Bedrock InvokeModel, `rds-db:connect` as `api_reader`).
- `handler.py`: event `{"phone": "+1...", "question": "..."}`. Validates E.164 phone, embeds the question with Titan v2, searches pgvector **filtered to that phone** (so one patient never sees another's rows), then Bedrock Converse (default `us.anthropic.claude-haiku-4-5-20251001-v1:0`, set by the `ModelId` parameter) explains the rows. Every `$` figure in the reply must appear in the retrieved rows, otherwise the reply is replaced with the raw rows (`guardrail_replaced: true`).
- DB access: IAM token as `api_reader` (no password; `pg8000` over SSL with the bundled RDS CA). `api_reader` has `SELECT` on `patient_treatment_embeddings` only.
- Tested: Ashwani/filling cash returns "manual verification needed" with no price; Ashmit/braces quotes $2686.40 exactly; a bad phone returns 400.
- Not built yet: API Gateway in front of it, auth, Bedrock Guardrails, answering from `nc_dental_costs` and `nc_hospitals` (today only the 20 patient rows are searchable).
- Deploy: zip `handler.py` + `rds-global-bundle.pem` + `pip install pg8000`, upload to `s3://<data-bucket>/code/rag.zip`, then `aws cloudformation deploy` (parameters in the stack; see `template.yaml`).

## Gotchas

- The hackathon Wi-Fi blocks outbound port 5432. Ports 443, 8080, 8443 and 2222 get through. To work around it the instance port was moved to **8443**, with an extra 8443 inbound rule for the dev IP. **Decision: it stays on 8443.** Use 8443 everywhere.
- Old account 010319218313 may still hold an RDS instance, two S3 buckets and a security group (billing). Delete them if no longer needed.
- The allowed IP is a single address. If your IP changes, update the security group.
- The instance is billed while it runs. Stop or delete it after the hackathon.

## Seeing it in the AWS console

There is no dashboard yet. What exists in the console:
- RDS instance and metrics: https://us-west-2.console.aws.amazon.com/rds/home?region=us-west-2#database:id=codelinc-dental;is-cluster=false (Monitoring tab shows CPU, connections, storage).
- Secrets Manager (admin password): search "rds!db-" in us-west-2.
- Table contents: the RDS console has no query editor for a standard RDS Postgres instance. Use a SQL client (DBeaver, pgAdmin, psql) with host above, port 8443 (or 5432 after revert), user `dbadmin`, SSL required.
- A CloudWatch dashboard for RDS metrics can be added (see `md-files/backend-next.md`).

## Users, chat history and API Gateway (2026-10-04, branch `ashwani/users-chat-apigw`)

- **`users`** (`db/04_users_chat.sql`): PK `phone` (E.164), with the same four people as `patient_treatment_embeddings`. Each row has fictional spouse and children in `family` JSONB, a plain-text `doc` and an optional Titan v2 `embedding vector(1024)` (HNSW index), modeled on the pgvector table. There are no passwords. OTP sign-in stores only SHA-256 hashes (`otp_hash`, 5-minute expiry, 5 attempts, 30 s resend cooldown), and the session token is also stored only as `session_hash` (7 days).
- **`chat_messages`**: a uuid id, `phone` FK to users (cascade), role, channel, text, `sources` JSONB (the RAG rows used), `guardrail_replaced`, and `created_at`. Indexed on `(phone, created_at)`.
- This file never drops anything, so chat history survives reruns. It also creates the IAM-auth role **`api_app`**: SELECT on the embeddings, SELECT plus column-level UPDATE (OTP and session columns only) on users, and SELECT/INSERT on chat_messages. The Lambda now logs in as `api_app`, not `api_reader`.
- Load it with `scripts/load_users_chat.py` as `dbadmin` (password injected, same pattern as the other loaders). The script also embeds each user's `doc`.
- **API Gateway** (HTTP API, same stack `codelinc-dental-rag`): `https://0kcegs7ea6.execute-api.us-west-2.amazonaws.com`. Routes: `POST /v1/auth/otp`, `POST /v1/auth/verify`, `GET /v1/me`, `GET /v1/messages`, `POST /v1/turns`, `GET /v1/turns/{id}`. CORS allows `127.0.0.1:5173` and `localhost:5173` (stack parameter `AllowedOrigins`). Throttling is 10 rps with a burst of 20.
- The phone always comes from the session token, never the request body. RAG now also sends the last 6 chat messages as context, and the $ guardrail still checks only against the retrieved rows.
- **Sign-in is Amazon Cognito** (see the section below). The earlier home-made OTP routes (`/v1/auth/otp`, `/v1/auth/verify`) and the demo `devCode` have been removed; the old `otp_*` and `session_*` columns on `users` are unused.
- **Frontend**: `VITE_DATA_MODE=live` with `VITE_API_BASE_URL` set to the URL above. Sign-in is phone + one-time code (Cognito). The household, chat history and chat answers are live. Plan rules and usage still come from the Lincoln sample plan, priced for the signed-in household, until the backend serves them. Linking texting, confirming actions and emailing a transcript return "not available yet" in live mode.
- **TLS 1.2 on login**: API Gateway's default endpoint only accepts TLS 1.2+ (checked: 1.0 and 1.1 handshakes are refused). RDS already has `rds.force_ssl=1` and `ssl_min_protocol_version=TLSv1.2`. The Lambda's DB connection now sets `minimum_version = TLSv1_2` explicitly, `scripts/load_users_chat.py` passes `ssl_min_protocol_version=TLSv1.2`, and the web sign-in refuses a non-HTTPS API address (except localhost).
- Tables were created on 2026-10-04 with `scripts/load_users_chat.py` through the aws-core plugin's `asm-exec` (`~/.claude/plugins/cache/claude-plugins-official/aws-core/*/skills/aws-secrets-manager/references/asm-exec`, run with `python3` and `AWS_PROFILE`/`AWS_REGION` set). Result: users 4, chat_messages 0, embedded 4.
- **Chat threads and channels** (2026-10-04): `chat_messages.conversation_id` groups messages into threads ("New chat" starts a new one), and `channel` now allows `whatsapp`. New route `GET /v1/conversations`; `GET /v1/messages?conversationId=` returns one thread; `POST /v1/turns` takes an optional `conversationId` and returns it. Only in-app threads can be continued from the app. WhatsApp threads show read-only under "WhatsApp Messenger" in the History menu, and nothing writes them yet, because no WhatsApp integration exists. Insert rows with `channel='whatsapp'` and one shared `conversation_id` to see them.
- **Answer style**: the system prompt is cheerful and proactive, puts retrieved figures and hospital names in `**bold**` (rendered by `components/floss/RichText.tsx`, plain text otherwise), and always closes with "Would you also be interested in something similar to be checked, such as <another condition>?". The $ guardrail is unchanged.

## Cognito sign-in and website hosting (2026-10-04, branch `ashwani/fullStack`)

- **Sign-in is phone number + password with Amazon Cognito.** Texted and emailed codes were tried and dropped: SNS and SES are both in sandbox in this account (only pre-verified numbers and addresses receive messages), and no US sending number is registered. The earlier home-made OTP routes (`/v1/auth/otp`, `/v1/auth/verify`) and the demo `devCode` are removed; the old `otp_*` and `session_*` columns on `users` are unused.
- **User pool** `codelinc-dental` (stack `codelinc-dental-rag`, `backend/rag/template.yaml`): username = phone number (immutable once created), **admin-create only** (no self sign-up), password policy 8+ characters with upper, lower and a number (lowered from 12 so the team's short demo passwords are accepted; raise `MinimumLength` in the template before real use). The app client has no secret and allows only `ALLOW_USER_PASSWORD_AUTH` (password sent to Cognito over TLS) and `ALLOW_REFRESH_TOKEN_AUTH`; the ID token is valid for 24 hours.
- **API Gateway JWT authorizer** (issuer = the pool, audience = the app client) on every route. The Lambda trusts only the verified `phone_number` claim of the **ID token**, and answers 403 if that phone isn't in `users`.
- **Users and passwords**: `scripts/create_cognito_users.py` creates the four people from `scripts/cognito_users.local.json` (git-ignored because it holds email addresses; format in `cognito_users.example.json`). Invitations are suppressed. A new user gets a random password nobody sees. To set a real one, either add `"password"` to that person's entry and rerun the script, or run
  `aws cognito-idp admin-set-user-password --user-pool-id <UserPoolId> --username <+phone> --password '<new>' --permanent`.
  Existing users keep their password on a rerun unless their entry has one.
- **Website**: `infra/web.yaml` (stack `codelinc-dental-web`): private S3 bucket, CloudFront with origin access control, HTTPS redirect, HSTS and a content security policy (only this site, Cognito and the API), and SPA routing (403/404 serve `index.html`). Deploy or update with `scripts/deploy_web.sh`. The API's CORS origins (`AllowedOrigins`) include the CloudFront URL.
- **TLS**: API Gateway and Cognito only accept TLS 1.2 or newer. The default `*.cloudfront.net` certificate still answers TLS 1.1 (checked with curl); enforcing 1.2 there needs a custom domain with its own certificate.

## Chat memory, hospital contacts, no emojis (2026-10-04)

- **Memory**: the Lambda replays the last 20 messages of the open conversation, and the pgvector search now uses the last two earlier questions plus the new one, so short follow-ups ("what about out of network?", "and for my son?") keep their topic. The prompt also receives the plan holder's family (from `users`) and treats the rows as the plan holder's estimates when the patient asks about a family member.
- **Confirm with the hospital**: new table `hospital_contacts` (`db/05_hospital_contacts.sql`, loaded by `scripts/load_hospital_contacts.py`): 30 hospitals with phone, website and, where the hospital itself publishes one, an email. 11 have an email: Atrium (7, `AHPA@AtriumHealth.org`, billing) and Novant (4, `NHCSCC@Contact.NovantHealth.org`, billing contact centre). The rest publish only phone numbers and estimate pages (checked 2026-10-04; Duke's only email is for assistance applications and takes no questions). When a price is missing, needs manual verification, or the question is outside the rows, the model tells the patient to confirm with the relevant hospital using exactly those details.
- **Guardrails**: any email, phone number or link in an answer that is not exactly a stored contact detail replaces the answer with the raw rows plus a code-built contact line (same `guardrail_replaced` flag as the dollar check). Emojis are stripped in the Lambda and again in the web renderer, so old saved messages also show without them. The closing "Would you also be interested in something similar to be checked..." question is appended in code if the model leaves it out.
- To add or correct a contact, edit `db/05_hospital_contacts.sql` and rerun the loader. Never fill an email from a guess: patients are told to write to exactly what is stored.

## Member numbers, family pricing and plan-limit advice (2026-10-04)

- **Fake member numbers** (Lincoln-style, for the demo): `users.member_number` for the plan holder and `memberNumber` inside each `family` entry. Pattern `LF-<8 digits>-NN` (`-00` holder, `-01` spouse, then children). They show on the family cards in the web app and the drafted hospital email includes the member number of the person the treatment is for.
- **Same prices for everyone**: the spouse and children are quoted the same rows as the plan holder (the model names the person).
- **Plan-limit advice is computed in code** (`_benefit_notes` in `backend/rag/handler.py`; the model never does arithmetic and the dollar guardrail also checks these notes). Terms come from the Lincoln plan summary in `packages/contracts/src/plans.ts`: a $1,500 annual maximum (calendar plan year, restarts January 1) for preventive, basic and major work, and a **separate $1,500 lifetime orthodontic maximum for children under 19; the summary lists no adult orthodontic benefit**.
  - Braces: the stored estimates ignore that limit, so the notes give corrected family totals (plan pays $1,500; family pays $3,872.80 in-network or $5,216.00 out-of-network on a $6,716.00 case), then practical options: predetermination of benefits (Lincoln recommends one above $300), a payment plan, FSA/HSA, and comparing quotes.
  - Because the ortho limit is lifetime, splitting braces into December (upper) and January (lower) would not unlock more benefit. The phasing advice is implemented for any treatment whose plan share exceeds the *annual* maximum, and for braces it switches on by setting `ORTHO_LIMIT_RESETS_YEARLY = True` if the real policy's orthodontic limit restarts each year.
  - Within 120 days of December 31 the notes also remind patients that unused annual benefit is lost on January 1.
  - Anything about changing care or billing is framed as "ask the dentist whether it is clinically sound".
- The guardrail now logs what tripped it (`guardrail replaced answer ...` in CloudWatch). Contact details handed to the model are limited to the two hospitals on the best-matching row so details from different hospitals cannot be mixed.
