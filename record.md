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
- A CloudWatch dashboard for RDS metrics can be added (see `next.md`).
