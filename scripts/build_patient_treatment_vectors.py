# Builds patient_treatment_costs.csv in S3 and its Titan v2 embeddings in pgvector (table patient_treatment_embeddings on RDS). Safe to rerun.
# Run: asm-exec -- env DB_PASSWORD={{resolve:secretsmanager:<master-secret-arn>:SecretString:password}} AWS_PROFILE=<profile> uv run --with "psycopg[binary]" --with "boto3[crt]" python scripts/build_patient_treatment_vectors.py
import json, os, csv, io, re, boto3, psycopg
R=os.environ.get("AWS_REGION","us-west-2"); ACCT=boto3.client("sts",region_name=R).get_caller_identity()["Account"]
DB=boto3.client("rds",region_name=R).describe_db_instances(DBInstanceIdentifier="codelinc-dental")["DBInstances"][0]
BUCKET=f"codelinc-dental-data-{ACCT}-{R}"; 
pw=os.environ["DB_PASSWORD"]  # injected by asm-exec; never fetched in code
with psycopg.connect(host=DB["Endpoint"]["Address"],port=DB["Endpoint"]["Port"],dbname="postgres",user="dbadmin",password=pw,sslmode="require") as c:
    inn=[r[0] for r in c.execute("select name from nc_hospitals where lincoln_financial='in-network' order by id")]
    oon=[r[0] for r in c.execute("select name from nc_hospitals where lincoln_financial='out-of-network' order by id")]
    cost={r[0]:float(r[1]) for r in c.execute("select cdt_code,cost_avg from nc_dental_costs")}
people=[("+17739986828","Ashwani Mishra"),("+16623524167","Ashmit Mishra"),("+16624978806","Muhammad Ashar"),("+15714736207","Ibrahim Jimmi")]
# disease -> (CDT code, plan coverage %)
dis=[("braces/orthodontics","D8090",.5),("teeth cleaning","D1110",1.0),("cavity/dental filling","D2391",.8),("gum sensitivity","D4346",.8),("impacted wisdom teeth","D7240",.5)]
ALLOWED=0.8
rows=[]
for pi,(ph,nm) in enumerate(people):
    for di,(d,code,cov) in enumerate(dis):
        cash=cost[code]; allowed=cash*ALLOWED
        cin=round(allowed*(1-cov),2); coon=round(cash-allowed*cov,2)
        h_in=inn[(pi*5+di)%len(inn)]; h_out=oon[(pi+di)%len(oon)]
        cashv="" if (nm=="Ashwani Mishra" and d=="cavity/dental filling") else f"{cash:.2f}"
        rows.append([ph,nm,d,f"{cin:.2f}",h_in,f"{coon:.2f}",h_out,cashv or "Needs manual verification"])
assert len(rows)==20
hdr=["phone","name","disease","in_network_treatment_cost","in_network_recommended_hospital","out_of_network_treatment_cost","out_of_network_recommended_hospital","cash_cost_no_insurance"]
buf=io.StringIO(); w=csv.writer(buf); w.writerow(hdr); w.writerows(rows)
s3=boto3.client("s3",region_name=R)
try: s3.create_bucket(Bucket=BUCKET,CreateBucketConfiguration={"LocationConstraint":R})
except s3.exceptions.BucketAlreadyOwnedByYou: pass
s3.put_public_access_block(Bucket=BUCKET,PublicAccessBlockConfiguration=dict(BlockPublicAcls=True,IgnorePublicAcls=True,BlockPublicPolicy=True,RestrictPublicBuckets=True))
s3.put_object(Bucket=BUCKET,Key="tables/patient_treatment_costs.csv",Body=buf.getvalue().encode(),ContentType="text/csv")
print("csv uploaded", BUCKET)
br=boto3.client("bedrock-runtime",region_name=R)
def embed(t):
    return json.loads(br.invoke_model(modelId="amazon.titan-embed-text-v2:0",body=json.dumps({"inputText":t,"dimensions":1024,"normalize":True}))["body"].read())["embedding"]
with psycopg.connect(host=DB["Endpoint"]["Address"],port=DB["Endpoint"]["Port"],dbname="postgres",user="dbadmin",password=pw,sslmode="require",autocommit=True) as c:
    c.execute("CREATE EXTENSION IF NOT EXISTS vector")
    c.execute("DROP TABLE IF EXISTS patient_treatment_embeddings")
    c.execute("""CREATE TABLE patient_treatment_embeddings (
      phone TEXT NOT NULL, name TEXT NOT NULL, disease TEXT NOT NULL,
      in_network_cost NUMERIC(8,2), in_network_hospital TEXT, out_of_network_cost NUMERIC(8,2), out_of_network_hospital TEXT,
      cash_cost TEXT, doc TEXT NOT NULL, embedding vector(1024) NOT NULL, PRIMARY KEY (phone, disease))""")
    for r in rows:
        cashtxt = f"${r[7]}" if r[7][0].isdigit() else "not available, manual verification required"
        text=(f"{r[1]} (phone {r[0]}) needs treatment for {r[2]}. With insurance in-network, the estimated cost is ${r[3]} at {r[4]}. "
              f"Out-of-network the estimated cost is ${r[5]} at {r[6]}. Paying cash without insurance: {cashtxt}.")
        c.execute("INSERT INTO patient_treatment_embeddings VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)",
                  (r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],text,str(embed(text))))
    c.execute("CREATE INDEX ON patient_treatment_embeddings USING hnsw (embedding vector_cosine_ops)")
    # DROP TABLE above removed the API's grant; restore it (role from db/04_users_chat.sql)
    if c.execute("select 1 from pg_roles where rolname='api_app'").fetchone(): c.execute("GRANT SELECT ON patient_treatment_embeddings TO api_app")
    print("vectors stored", c.execute("select count(*) from patient_treatment_embeddings").fetchone()[0])
    q=str(embed("How much is a tooth filling for Ashwani without insurance?"))
    for d,dist in c.execute("select doc, embedding <=> %s::vector from patient_treatment_embeddings order by 2 limit 2",(q,)).fetchall(): print(round(dist,3),d[:150])
