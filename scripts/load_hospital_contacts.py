# Loads db/05_hospital_contacts.sql (hospital price-confirmation contacts) into the codelinc-dental RDS instance. Safe to rerun.
# Run: asm-exec -- env DB_PASSWORD={{resolve:secretsmanager:<master-secret-arn>:SecretString:password}} AWS_PROFILE=workshop uv run --with "psycopg[binary]" --with "boto3[crt]" python scripts/load_hospital_contacts.py
import os, boto3, psycopg
R=os.environ.get("AWS_REGION","us-west-2")
DB=boto3.client("rds",region_name=R).describe_db_instances(DBInstanceIdentifier="codelinc-dental")["DBInstances"][0]
sql=open(os.path.join(os.path.dirname(__file__),"..","db","05_hospital_contacts.sql")).read()
with psycopg.connect(host=DB["Endpoint"]["Address"],port=DB["Endpoint"]["Port"],dbname="postgres",user="dbadmin",password=os.environ["DB_PASSWORD"],sslmode="require",ssl_min_protocol_version="TLSv1.2",autocommit=True) as c:
    c.execute(sql); print("loaded 05_hospital_contacts.sql")
    print("contacts",c.execute("select count(*) from hospital_contacts").fetchone()[0],"| with email",c.execute("select count(*) from hospital_contacts where email is not null").fetchone()[0])
