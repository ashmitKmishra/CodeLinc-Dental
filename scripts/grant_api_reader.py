# Grants the IAM-auth role api_reader read access to the tables the API serves.
# DB_PASSWORD is injected by asm-exec (see load_tables.py).
import os, boto3, psycopg
R=os.environ.get("AWS_REGION","us-west-2")
DB=boto3.client("rds",region_name=R).describe_db_instances(DBInstanceIdentifier="codelinc-dental")["DBInstances"][0]
with psycopg.connect(host=DB["Endpoint"]["Address"],port=DB["Endpoint"]["Port"],dbname="postgres",user="dbadmin",password=os.environ["DB_PASSWORD"],sslmode="require",autocommit=True) as c:
    c.execute("GRANT SELECT ON patient_treatment_embeddings TO api_reader")
    print("granted patient_treatment_embeddings to api_reader")
