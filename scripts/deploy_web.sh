#!/usr/bin/env bash
# Builds the web app against the live API and publishes it to S3 + CloudFront. Safe to rerun.
# Needs: AWS_PROFILE (default workshop), node/npm. Stacks: codelinc-dental-rag (API + Cognito), codelinc-dental-web (hosting).
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-workshop}" AWS_REGION="${AWS_REGION:-us-west-2}"
cd "$(dirname "$0")/.."
out() { aws cloudformation describe-stacks --stack-name "$1" --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }
API=$(out codelinc-dental-rag ApiUrl); CLIENT=$(out codelinc-dental-rag UserPoolClientId)

aws cloudformation deploy --stack-name codelinc-dental-web --template-file infra/web.yaml --parameter-overrides "ApiOrigin=$API" "CognitoRegion=$AWS_REGION"
BUCKET=$(out codelinc-dental-web BucketName); DIST=$(out codelinc-dental-web DistributionId); SITE=$(out codelinc-dental-web SiteUrl)

VITE_DATA_MODE=live VITE_API_BASE_URL="$API" VITE_COGNITO_CLIENT_ID="$CLIENT" VITE_COGNITO_REGION="$AWS_REGION" npm run build -w @floss/web
# hashed assets never change (cache forever); index.html must always be revalidated
aws s3 sync apps/web/dist "s3://$BUCKET" --delete --exclude index.html --cache-control "public,max-age=31536000,immutable"
aws s3 cp apps/web/dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache" --content-type "text/html"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
echo "Site: $SITE"
echo "Add $SITE to AllowedOrigins in the codelinc-dental-rag stack so the browser can call the API."
