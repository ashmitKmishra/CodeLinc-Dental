# Creates users + chat_messages (db/04_users_chat.sql), the api_app role, and the Titan v2 embedding of each user's doc.
# Safe to rerun: never drops tables, so chat history is kept.
# Run: asm-exec -- env DB_PASSWORD={{resolve:secretsmanager:<master-secret-arn>:SecretString:password}} AWS_PROFILE=workshop uv run --with "psycopg[binary]" --with "boto3[crt]" python scripts/load_users_chat.py
import json, os, boto3, psycopg
R=os.environ.get("AWS_REGION","us-west-2")
DB=boto3.client("rds",region_name=R).describe_db_instances(DBInstanceIdentifier="codelinc-dental")["DBInstances"][0]
br=boto3.client("bedrock-runtime",region_name=R)
def embed(t):
    return json.loads(br.invoke_model(modelId="amazon.titan-embed-text-v2:0",body=json.dumps({"inputText":t,"dimensions":1024,"normalize":True}))["body"].read())["embedding"]
sql=open(os.path.join(os.path.dirname(__file__),"..","db","04_users_chat.sql")).read()
with psycopg.connect(host=DB["Endpoint"]["Address"],port=DB["Endpoint"]["Port"],dbname="postgres",user="dbadmin",password=os.environ["DB_PASSWORD"],sslmode="require",ssl_min_protocol_version="TLSv1.2",autocommit=True) as c:
    c.execute(sql); print("loaded 04_users_chat.sql")
    for phone,doc in c.execute("select phone, doc from users").fetchall():
        c.execute("update users set embedding=%s::vector where phone=%s",(str(embed(doc)),phone))
    c.execute("CREATE INDEX IF NOT EXISTS users_embedding_hnsw ON users USING hnsw (embedding vector_cosine_ops)")
    for t in ["users","chat_messages"]:
        print(t,c.execute(f"select count(*) from {t}").fetchone()[0])
    print("embedded",c.execute("select count(*) from users where embedding is not null").fetchone()[0])
