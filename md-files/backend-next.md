# Next steps

Final goal: full-stack deployment on AWS. **Order: RAG on Bedrock first, then the API, then the frontend.**

## 0. Housekeeping
- [x] RDS port stays on **8443** (the venue Wi-Fi blocks 5432). Keep the 8443 security-group rule, and use port 8443 in every connection string and in the Lambda's security group.
- [ ] Decide the database: `md-files/BACKEND.md` §13 defaults to DynamoDB, with Postgres as the swap. Agree with the team (B owns data) before building more on RDS.
- [ ] Replace the random network flags in `nc_hospitals` with real payer directory data if accuracy starts to matter.

## 1. RAG in Amazon Bedrock (next)
- [ ] Choose the vector store. Today the 20-row embeddings live in pgvector on RDS. Bedrock Knowledge Bases support Aurora PostgreSQL (pgvector), OpenSearch Serverless and S3 Vectors. A standard RDS Postgres instance is not on that list (verify in the docs). The workshop role denies S3 Vectors. Options: the existing pgvector table (used directly by our own retrieval code), or a Knowledge Base on OpenSearch Serverless or Aurora if the role allows it.
- [ ] Turn the three tables into documents. One doc per (service, insurer) with the in-network vs out-of-network cost summary, plus per-insurer hospital network lists. Cost math must come from SQL or the engine, not the model.
- [ ] Upload docs to S3, create the Knowledge Base (Titan Text Embeddings v2), and sync.
- [ ] Add a generation model via Converse (`RetrieveAndGenerate`, or `Retrieve` plus our own prompt) and Bedrock Guardrails: block diagnosis and financial advice, block SSN and card numbers.
- [ ] Test with sample questions per patient (e.g. "Is Duke University Hospital in network for me?", "What will a crown cost?") and check every $ figure against the tables.

## 2. API layer
- [x] RAG Lambda deployed and tested (see `md-files/backend-record.md`). Remaining: API Gateway route to it, request auth, Guardrails, widen the corpus beyond the 20 patient rows.
- [ ] Lambda and API Gateway following the `/v1` contract in `md-files/BACKEND.md` §4.
- [ ] Put the Lambda in the RDS VPC and allow its security group (not a public IP). Connect as `api_reader` with an IAM token.
- [ ] Grant `api_reader` access only to tables the API needs. Never expose `patients` without auth (Cognito).
- [ ] CORS for the dashboard origin.

## 3. Messaging
Out of scope for this workstream. Someone else owns it. The Bedrock API does the LLM work and this workstream only supplies the data and retrieval.

## 4. Frontend
- [ ] Dashboard per `md-files/FRONTEND.md`, reading only from the API.

## 5. Deploy and operate
- [ ] Infrastructure as code (CDK or CloudFormation) for RDS, Lambda, API Gateway, the Knowledge Base and the frontend hosting (S3 + CloudFront or Amplify).
- [ ] CloudWatch dashboard and alarms for RDS and the API. Secrets rotation. Tighten the security group.
- [ ] Tear down or stop anything billable after the hackathon.
