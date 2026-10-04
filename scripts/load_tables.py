# Loads db/*.sql into the codelinc-dental RDS instance as the admin user.
# DB_PASSWORD is injected by asm-exec (see build_patient_treatment_vectors.py header); the code never reads Secrets Manager.
import os, boto3, psycopg
R=os.environ.get("AWS_REGION","us-west-2")
DB=boto3.client("rds",region_name=R).describe_db_instances(DBInstanceIdentifier="codelinc-dental")["DBInstances"][0]
here=os.path.join(os.path.dirname(__file__),"..","db")
with psycopg.connect(host=DB["Endpoint"]["Address"],port=DB["Endpoint"]["Port"],dbname="postgres",user="dbadmin",password=os.environ["DB_PASSWORD"],sslmode="require",autocommit=True) as c:
    for f in sorted(x for x in os.listdir(here) if x.endswith(".sql")):
        c.execute(open(os.path.join(here,f)).read()); print("loaded",f)
    for t in ["patients","nc_hospitals","nc_dental_costs"]:
        print(t,c.execute(f"select count(*) from {t}").fetchone()[0])
