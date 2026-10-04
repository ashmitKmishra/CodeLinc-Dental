"""Deploy (or update) the chatbot on AWS Lambda with a permanent Function URL.

    python deploy.py

Your local AWS credentials (from .env, ~/.aws or AWS_PROFILE) are used only to create the resources.
The function itself runs with an IAM role (Bedrock, DynamoDB, logs), so no AWS keys are stored in it.
Settings from .env (Twilio, models, allowlist) are copied into the function's environment variables.
Run it again any time to push new code or .env changes; the URL stays the same.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile

import boto3
from botocore.exceptions import ClientError, ParamValidationError
from dotenv import load_dotenv

load_dotenv()

NAME = os.getenv("LAMBDA_NAME", "whatsapp-chatbot")
TABLE = f"{NAME}-history"
REGION = os.getenv("AWS_REGION", "us-east-1")
CODE_FILES = ["lambda_function.py", "bot.py", "bedrock.py", "history.py", "floss.py"]
PACKAGES = ["twilio", "openai", "python-dotenv"]  # boto3 is already in the Lambda runtime
ENV_KEYS = [
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_API_KEY", "TWILIO_API_SECRET", "TWILIO_PHONE_NUMBER",
    "TWILIO_VALIDATE_SIGNATURE", "BEDROCK_MODEL_ID", "BEDROCK_FALLBACK_MODEL_ID", "BEDROCK_USE_SYSTEM_PROMPT",
    "MAX_TOKENS", "SYSTEM_PROMPT", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "OPENAI_REASONING_EFFORT",
    "ALLOWED_NUMBERS", "RATE_LIMIT_PER_MINUTE", "HISTORY_TURNS", "FLOSS_RAG_FUNCTION",
]
HERE = os.path.dirname(os.path.abspath(__file__))

session = boto3.Session(region_name=REGION)
iam, ddb, lam = session.client("iam"), session.client("dynamodb"), session.client("lambda")
ACCOUNT = session.client("sts").get_caller_identity()["Account"]
FUNCTION_ARN = f"arn:aws:lambda:{REGION}:{ACCOUNT}:function:{NAME}"
TABLE_ARN = f"arn:aws:dynamodb:{REGION}:{ACCOUNT}:table/{TABLE}"


def build_zip():
    build = os.path.join(HERE, "build")
    shutil.rmtree(build, ignore_errors=True)
    print("Installing dependencies for Lambda (Linux arm64, Python 3.12)...")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "--quiet", "--target", build, "--platform", "manylinux2014_aarch64",
         "--implementation", "cp", "--python-version", "3.12", "--only-binary=:all:", *PACKAGES],
        check=True,
    )
    for f in CODE_FILES:
        shutil.copy(os.path.join(HERE, f), build)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(build):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for f in files:
                path = os.path.join(root, f)
                z.write(path, os.path.relpath(path, build))
    print(f"Package: {buf.tell() / 1e6:.1f} MB")
    return buf.getvalue()


def ensure_role():
    role = f"{NAME}-role"
    trust = {"Version": "2012-10-17", "Statement": [
        {"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]}
    try:
        arn = iam.get_role(RoleName=role)["Role"]["Arn"]
        created = False
    except iam.exceptions.NoSuchEntityException:
        arn = iam.create_role(RoleName=role, AssumeRolePolicyDocument=json.dumps(trust))["Role"]["Arn"]
        created = True
    policy = {"Version": "2012-10-17", "Statement": [
        {"Effect": "Allow", "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
         "Resource": f"arn:aws:logs:{REGION}:{ACCOUNT}:*"},
        {"Effect": "Allow", "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], "Resource": "*"},
        {"Effect": "Allow", "Action": ["dynamodb:Query", "dynamodb:PutItem"], "Resource": TABLE_ARN},
        {"Effect": "Allow", "Action": "lambda:InvokeFunction", "Resource": FUNCTION_ARN},
    ]}
    if os.getenv("FLOSS_RAG_FUNCTION"):  # the team's RAG Lambda that answers from the member's plan data
        policy["Statement"].append({"Effect": "Allow", "Action": "lambda:InvokeFunction",
                                    "Resource": f"arn:aws:lambda:{REGION}:{ACCOUNT}:function:{os.environ['FLOSS_RAG_FUNCTION']}"})
    iam.put_role_policy(RoleName=role, PolicyName=f"{NAME}-policy", PolicyDocument=json.dumps(policy))
    print(f"IAM role: {role}{' (created)' if created else ''}")
    return arn, created


def ensure_table():
    try:
        ddb.describe_table(TableName=TABLE)
        print(f"DynamoDB table: {TABLE}")
    except ddb.exceptions.ResourceNotFoundException:
        ddb.create_table(
            TableName=TABLE, BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": "phone", "AttributeType": "S"},
                                  {"AttributeName": "ts", "AttributeType": "N"}],
            KeySchema=[{"AttributeName": "phone", "KeyType": "HASH"}, {"AttributeName": "ts", "KeyType": "RANGE"}],
        )
        ddb.get_waiter("table_exists").wait(TableName=TABLE)
        print(f"DynamoDB table: {TABLE} (created)")


def ensure_function(zip_bytes, role_arn, new_role):
    env = {k: os.environ[k] for k in ENV_KEYS if os.getenv(k)}
    env["HISTORY_TABLE"] = TABLE
    config = dict(Role=role_arn, Handler="lambda_function.handler", Runtime="python3.12", Timeout=60,
                  MemorySize=512, Environment={"Variables": env})
    try:
        lam.get_function(FunctionName=NAME)
        lam.update_function_code(FunctionName=NAME, ZipFile=zip_bytes, Architectures=["arm64"])
        lam.get_waiter("function_updated_v2").wait(FunctionName=NAME)
        lam.update_function_configuration(FunctionName=NAME, **config)
        lam.get_waiter("function_updated_v2").wait(FunctionName=NAME)
        print(f"Lambda function: {NAME} (updated)")
    except lam.exceptions.ResourceNotFoundException:
        for attempt in range(10):  # a brand-new IAM role takes a few seconds to become usable
            try:
                lam.create_function(FunctionName=NAME, Code={"ZipFile": zip_bytes}, Architectures=["arm64"], **config)
                break
            except ClientError as e:
                if "cannot be assumed" not in str(e) or attempt == 9:
                    raise
                time.sleep(5 if new_role else 2)
        lam.get_waiter("function_active_v2").wait(FunctionName=NAME)
        print(f"Lambda function: {NAME} (created)")
    # Never retry the background job: a retry would text the user twice.
    lam.put_function_event_invoke_config(FunctionName=NAME, MaximumRetryAttempts=0)


def ensure_url():
    try:
        url = lam.get_function_url_config(FunctionName=NAME)["FunctionUrl"]
    except lam.exceptions.ResourceNotFoundException:
        url = lam.create_function_url_config(FunctionName=NAME, AuthType="NONE")["FunctionUrl"]
    # Public URL; requests are still checked against Twilio's signature inside the function.
    grants = [dict(StatementId="public-url", Action="lambda:InvokeFunctionUrl", FunctionUrlAuthType="NONE"),
              dict(StatementId="public-url-invoke", Action="lambda:InvokeFunction", InvokedViaFunctionUrl=True)]
    for grant in grants:
        try:
            lam.add_permission(FunctionName=NAME, Principal="*", **grant)
        except lam.exceptions.ResourceConflictException:
            pass  # already granted
        except ParamValidationError:
            pass  # older boto3 without InvokedViaFunctionUrl; the first grant is enough there
    return url.rstrip("/")


if __name__ == "__main__":
    print(f"Deploying {NAME} to account {ACCOUNT}, region {REGION}")
    zip_bytes = build_zip()
    role_arn, new_role = ensure_role()
    ensure_table()
    ensure_function(zip_bytes, role_arn, new_role)
    url = ensure_url()
    print(f"\nDone. Health check: {url}/")
    print(f"Twilio webhook (When a message comes in, POST): {url}/sms")
