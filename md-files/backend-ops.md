# Backend operations

How to sign people in, add users and redeploy. The live site is https://d3unrkn8gkr6mk.cloudfront.net. These steps need the `workshop` AWS profile (account 435157217462, region us-west-2).

## Signing in

Accounts are created by the team. There is no sign-up and no password reset on the page, and codes are not sent by text or email. Sign in with the mobile number on the plan (with the country code) and the password. Passwords are not stored in this repo, so ask Ashwani for yours.

- **No password box on the page:** the browser has an old copy. Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows) or use a private window.
- **"That number or password isn't right":** check the number includes `+1` and the password matches exactly (it is case sensitive). Five or so wrong tries in a row make Cognito slow down for a few minutes.

## Setting or changing a password

```bash
aws cognito-idp admin-set-user-password --profile workshop --region us-west-2 \
  --user-pool-id us-west-2_qZf7sqhYd --username +1XXXXXXXXXX --password 'NewPassword1' --permanent
```

A password needs 8 or more characters with an upper-case letter, a lower-case letter and a number. The minimum is low on purpose for the demo. Raise `MinimumLength` in `backend/rag/template.yaml` before real use.

## Adding someone new

1. Add their row to `db/04_users_chat.sql` (and their treatment rows via `scripts/build_patient_treatment_vectors.py`) and load it with `scripts/load_users_chat.py`.
2. Add `{ "phone", "email" }` (plus an optional `"password"`) to `scripts/cognito_users.local.json`. The file is git-ignored because it holds contact details. The format is in `scripts/cognito_users.example.json`.
3. Run `AWS_PROFILE=workshop uv run --with boto3 python scripts/create_cognito_users.py`.

## Deploying

- **Website** after a front-end change: `./scripts/deploy_web.sh` (needs Node and the `workshop` profile). Stack `codelinc-dental-web`, template `infra/web.yaml`.
- **API** after a Lambda or template change: `./backend/rag/deploy.sh`. It packages `handler.py`, `advisor.py`, the RDS CA bundle and pg8000, then deploys the stack `codelinc-dental-rag` (template `backend/rag/template.yaml`). Offline tests: `python3 -m unittest backend/rag/test_advisor.py`. More detail is in `backend-record.md`.
- **Database changes** need the admin login, which is only available through `asm-exec` (see the header of `scripts/load_users_chat.py`).
- **TLS:** API Gateway, Cognito and the database connection require TLS 1.2 or newer. CloudFront's default address still accepts older versions. Fixing that needs a custom domain.

The RDS instance and the workshop credentials are temporary. If the site stops working, the credentials have probably expired or the instance was stopped.
