#!/usr/bin/env bash
# Packages the Lambda (handler.py, advisor.py, the RDS CA bundle and pg8000), uploads it, and updates the codelinc-dental-rag stack.
# Needs: AWS_PROFILE (default workshop), pip3 and zip. The template parameters (VPC, subnets, DB host...) are kept from the last deploy.
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-workshop}" AWS_REGION="${AWS_REGION:-us-west-2}"
cd "$(dirname "$0")"
BUILD=$(mktemp -d); trap 'rm -rf "$BUILD"' EXIT
pip3 install -q pg8000 -t "$BUILD" --python-version 3.12 --only-binary=:all:
cp handler.py advisor.py rds-global-bundle.pem "$BUILD/"
(cd "$BUILD" && zip -qr "$BUILD.zip" .)
HASH=$(shasum "$BUILD.zip" | cut -c1-10)
BUCKET=$(aws cloudformation describe-stacks --stack-name codelinc-dental-rag --query "Stacks[0].Parameters[?ParameterKey=='CodeBucket'].ParameterValue" --output text)
aws s3 cp "$BUILD.zip" "s3://$BUCKET/code/api-$HASH.zip" --only-show-errors
rm -f "$BUILD.zip"
aws cloudformation deploy --stack-name codelinc-dental-rag --template-file template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides "CodeKey=code/api-$HASH.zip" | tail -1
