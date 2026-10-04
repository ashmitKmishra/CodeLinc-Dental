# Creates the Cognito users who may sign in, from scripts/cognito_users.local.json (git-ignored; format in the .example file).
# Sign-in is phone number + password. Invitations are suppressed, so nobody is texted or emailed. A new user gets a random password that is
# never shown or stored; add a "password" field to someone's entry to set theirs (12+ characters with upper, lower and a number).
# Existing users keep their password unless their entry has a "password". Safe to rerun.
# Run: AWS_PROFILE=workshop uv run --with boto3 python scripts/create_cognito_users.py
import json, os, secrets, boto3
R=os.environ.get("AWS_REGION","us-west-2")
pool=next(o["OutputValue"] for o in boto3.client("cloudformation",region_name=R).describe_stacks(StackName="codelinc-dental-rag")["Stacks"][0]["Outputs"] if o["OutputKey"]=="UserPoolId")
idp=boto3.client("cognito-idp",region_name=R)
for u in json.load(open(os.path.join(os.path.dirname(__file__),"cognito_users.local.json"))):
    attrs=[{"Name":"phone_number","Value":u["phone"]},{"Name":"phone_number_verified","Value":"true"},{"Name":"email","Value":u["email"]},{"Name":"email_verified","Value":"true"}]
    password=u.get("password")
    try:
        idp.admin_create_user(UserPoolId=pool,Username=u["phone"],UserAttributes=attrs,MessageAction="SUPPRESS"); state="created"
        password=password or secrets.token_urlsafe(24)+"aA1!"
    except idp.exceptions.UsernameExistsException:
        idp.admin_update_user_attributes(UserPoolId=pool,Username=u["phone"],UserAttributes=attrs); state="updated"
    if password:
        idp.admin_set_user_password(UserPoolId=pool,Username=u["phone"],Password=password,Permanent=True); state+=", password set"
    print(state,u["phone"])
