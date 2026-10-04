-- users + chat_messages: who can sign in (phone + one-time code, no passwords) and every chat turn they have with Floss.
-- Modeled on patient_treatment_embeddings: same four phones (E.164) and names, a plain-text `doc` per row and an optional
-- Titan v2 `embedding vector(1024)` of that doc (filled by scripts/load_users_chat.py).
-- Spouse and children are fictional. The four phones are the team's own numbers, already used by the RAG table.
--
-- Unlike 01-03, this file never drops anything: chat history must survive a rerun. Safe to run more than once.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  phone              TEXT        PRIMARY KEY CHECK (phone ~ '^\+[1-9][0-9]{9,14}$'),
  full_name          TEXT        NOT NULL,
  birth_date         DATE        NOT NULL,
  member_number      TEXT,       -- fake Lincoln member ID of the plan holder; family members carry theirs inside `family`
  employer           TEXT        NOT NULL,
  insurance          TEXT        NOT NULL,
  -- [{"firstName","lastName","relationship":"spouse"|"child","role":"son"|"daughter" (children only),"memberNumber","birthDate":"YYYY-MM-DD"}]
  family             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  doc                TEXT        NOT NULL,
  embedding          vector(1024),
  -- OTP sign-in. Only SHA-256 hashes are stored, never the code or the session token.
  otp_hash           TEXT,
  otp_expires_at     TIMESTAMPTZ,
  otp_attempts       SMALLINT    NOT NULL DEFAULT 0,
  otp_sent_at        TIMESTAMPTZ,
  session_hash       TEXT        UNIQUE,
  session_expires_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone              TEXT        NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
  conversation_id    UUID,       -- one chat thread; "New chat" starts a new one. NOT NULL is set below, after the backfill.
  role               TEXT        NOT NULL CHECK (role IN ('user','assistant','system')),
  channel            TEXT        NOT NULL DEFAULT 'app',
  text               TEXT        NOT NULL,
  -- assistant only: the RAG rows used ([{"disease","distance"}]) and whether the $ guardrail replaced the model's reply
  sources            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  guardrail_replaced BOOLEAN     NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS chat_messages_phone_created ON chat_messages (phone, created_at);

-- Upgrades for databases created before conversations / WhatsApp / member numbers existed (no-ops on a fresh one).
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_number TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id UUID;
WITH g AS (SELECT phone, channel, gen_random_uuid() AS cid
           FROM (SELECT DISTINCT phone, channel FROM chat_messages WHERE conversation_id IS NULL) d)
UPDATE chat_messages m SET conversation_id = g.cid FROM g
 WHERE m.conversation_id IS NULL AND m.phone = g.phone AND m.channel = g.channel;
ALTER TABLE chat_messages ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_channel_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_channel_check CHECK (channel IN ('app','sms','email','whatsapp'));
CREATE INDEX IF NOT EXISTS chat_messages_conversation ON chat_messages (phone, conversation_id, created_at);

INSERT INTO users (phone, full_name, birth_date, member_number, employer, insurance, family, doc) VALUES
 ('+17739986828', 'Ashwani Mishra', '1995-06-11', 'LF-48213907-00', 'Lincoln Financial', 'Lincoln Financial',
  '[{"firstName":"Priyanka","memberNumber":"LF-48213907-01","lastName":"Mishra","relationship":"spouse","birthDate":"1996-08-14"},
    {"firstName":"Aarav","role":"son","memberNumber":"LF-48213907-02","lastName":"Mishra","relationship":"child","birthDate":"2019-03-22"},
    {"firstName":"Anaya","role":"daughter","memberNumber":"LF-48213907-03","lastName":"Mishra","relationship":"child","birthDate":"2022-11-05"}]',
  'Ashwani Mishra (phone +17739986828) works at Lincoln Financial and is covered by Lincoln Financial dental. Family on the plan: spouse Priyanka Mishra, son Aarav Mishra (born 2019), daughter Anaya Mishra (born 2022).'),
 ('+16623524167', 'Ashmit Mishra', '1996-12-03', 'LF-61975024-00', 'Lincoln Financial', 'Lincoln Financial',
  '[{"firstName":"Kavya","memberNumber":"LF-61975024-01","lastName":"Mishra","relationship":"spouse","birthDate":"1997-02-09"},
    {"firstName":"Vihaan","role":"son","memberNumber":"LF-61975024-02","lastName":"Mishra","relationship":"child","birthDate":"2021-07-30"}]',
  'Ashmit Mishra (phone +16623524167) works at Lincoln Financial and is covered by Lincoln Financial dental. Family on the plan: spouse Kavya Mishra, son Vihaan Mishra (born 2021).'),
 ('+16624978806', 'Muhammad Ashar', '1993-03-25', 'LF-30586412-00', 'Lincoln Financial', 'Lincoln Financial',
  '[{"firstName":"Ayesha","memberNumber":"LF-30586412-01","lastName":"Ashar","relationship":"spouse","birthDate":"1995-05-17"},
    {"firstName":"Zayan","role":"son","memberNumber":"LF-30586412-02","lastName":"Ashar","relationship":"child","birthDate":"2018-12-01"},
    {"firstName":"Inaya","role":"daughter","memberNumber":"LF-30586412-03","lastName":"Ashar","relationship":"child","birthDate":"2023-04-19"}]',
  'Muhammad Ashar (phone +16624978806) works at Lincoln Financial and is covered by Lincoln Financial dental. Family on the plan: spouse Ayesha Ashar, son Zayan Ashar (born 2018), daughter Inaya Ashar (born 2023).'),
 ('+15714736207', 'Ibrahim Jimmi', '1992-07-08', 'LF-75429183-00', 'Lincoln Financial', 'Lincoln Financial',
  '[{"firstName":"Fatima","memberNumber":"LF-75429183-01","lastName":"Jimmi","relationship":"spouse","birthDate":"1994-10-26"},
    {"firstName":"Yusuf","role":"son","memberNumber":"LF-75429183-02","lastName":"Jimmi","relationship":"child","birthDate":"2017-09-12"},
    {"firstName":"Maryam","role":"daughter","memberNumber":"LF-75429183-03","lastName":"Jimmi","relationship":"child","birthDate":"2020-01-28"}]',
  'Ibrahim Jimmi (phone +15714736207) works at Lincoln Financial and is covered by Lincoln Financial dental. Family on the plan: spouse Fatima Jimmi, son Yusuf Jimmi (born 2017), daughter Maryam Jimmi (born 2020).')
ON CONFLICT (phone) DO UPDATE SET
  full_name = EXCLUDED.full_name, birth_date = EXCLUDED.birth_date, member_number = EXCLUDED.member_number, employer = EXCLUDED.employer, insurance = EXCLUDED.insurance,
  family = EXCLUDED.family, doc = EXCLUDED.doc;

-- api_app: the role the API Lambda logs in as (IAM token, no password). Least privilege for these routes only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'api_app') THEN
    CREATE ROLE api_app WITH LOGIN;
  END IF;
END $$;
GRANT rds_iam TO api_app;
GRANT CONNECT ON DATABASE postgres TO api_app;
GRANT USAGE ON SCHEMA public TO api_app;
DO $$
BEGIN  -- built by scripts/build_patient_treatment_vectors.py, which also re-grants this after each rebuild
  IF to_regclass('public.patient_treatment_embeddings') IS NOT NULL THEN
    GRANT SELECT ON patient_treatment_embeddings TO api_app;
  END IF;
END $$;
GRANT SELECT ON users TO api_app;
GRANT UPDATE (otp_hash, otp_expires_at, otp_attempts, otp_sent_at, session_hash, session_expires_at) ON users TO api_app;
GRANT SELECT, INSERT ON chat_messages TO api_app;

COMMIT;
