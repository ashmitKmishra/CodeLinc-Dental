# Record: what's been done (2026-10-03)

Branch: `ashwani/tale-of-threeDatasets`. Goal of this slice: three dental datasets in AWS RDS for the employee dental-plan pipeline (iMessage and dashboard -> vector DB with in-network vs out-of-network cost summaries).

## Datasets (SQL in `db/`)

| File | Table | Rows | Notes |
|---|---|---|---|
| `01_patients.sql` | `patients` | 10 | Fictional employees. Columns: employer, `insurance` (Lincoln Financial, Delta Dental, MetLife, Cigna, Aetna), `has_family`, `family_members` (e.g. `spouse, daughter`). Lincoln Financial on 3 patients. Phones use the reserved 555-01xx range. |
| `02_nc_hospitals.sql` | `nc_hospitals` | 30 | Real NC hospital names, city and system. One column per insurer: `in-network` or `out-of-network`. **Network values are random placeholders, not accurate.** |
| `03_nc_dental_costs.sql` | `nc_dental_costs` | 30 | Supplied by the team (CDT code, low/avg/high cost, basis, source). Also creates the `api_reader` IAM-auth role with read access to this table. |

Each file drops and rebuilds its table, so it is safe to re-run.

## AWS setup

- Tooling: AWS CLI v2, `uv`, Agent Toolkit (skills and AWS MCP server config written for Claude Code, Cursor and Kiro). Profile `default`, region `us-east-2`, logged in with `aws login`.
- RDS instance `codelinc-dental`: Postgres 18.3, `db.t4g.micro`, 20 GB gp3, encrypted, IAM auth on, publicly accessible, 1-day backups, single AZ.
- Endpoint: `codelinc-dental.c9agi4wgwbjk.us-east-2.rds.amazonaws.com`. Database `postgres`, schema `public` (kept to match the grants in `03_nc_dental_costs.sql`).
- Admin user `dbadmin`. Password is managed by AWS Secrets Manager (`rds!db-bdf3159a-...`). Never commit it.
- Security group `codelinc-dental-rds` (`sg-062f9172a418b2ea1`): inbound Postgres only from the developer's IP /32.
- `api_reader`: IAM-auth, read-only on all three tables. Tested with an IAM token: reads returned 10 / 30 / 30 rows.

## Gotchas

- The hackathon Wi-Fi blocks outbound port 5432. Ports 443, 8080, 8443 and 2222 get through. To work around it the instance port was moved to **8443**, with an extra 8443 inbound rule for the dev IP. **Current state: still on 8443.** Revert to 5432 and drop the 8443 rule when on a normal network.
- The allowed IP is a single address. If your IP changes, update the security group.
- The instance is billed while it runs. Stop or delete it after the hackathon.

## Seeing it in the AWS console

There is no dashboard yet. What exists in the console:
- RDS instance and metrics: https://us-east-2.console.aws.amazon.com/rds/home?region=us-east-2#database:id=codelinc-dental;is-cluster=false (Monitoring tab shows CPU, connections, storage).
- Secrets Manager (admin password): search "rds!db-" in us-east-2.
- Table contents: the RDS console has no query editor for a standard RDS Postgres instance. Use a SQL client (DBeaver, pgAdmin, psql) with host above, port 8443 (or 5432 after revert), user `dbadmin`, SSL required.
- A CloudWatch dashboard for RDS metrics can be added (see `next.md`).
