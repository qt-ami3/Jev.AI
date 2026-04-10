#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
STACK_NAME="LinkedInScraperStack"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

cd "$REPO_ROOT"

# ── Resolve ECR repo URI ────────────────────────────────────────
echo "==> Looking up ECR repository..."
ECR_URI=$(aws ecr describe-repositories \
  --repository-names linkedin-scraper \
  --region "$REGION" \
  --query 'repositories[0].repositoryUri' \
  --output text)
REGISTRY="${ECR_URI%%/*}"
echo "    ECR: $ECR_URI"

# ── ECR login ───────────────────────────────────────────────────
echo "==> Logging in to ECR..."
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY" 2>/dev/null
echo "    Logged in."

# ── Docker build & push ─────────────────────────────────────────
echo "==> Building Docker image..."
docker build -t "$ECR_URI:latest" .
echo "==> Pushing to ECR..."
docker push "$ECR_URI:latest"

# ── CDK deploy (if infra changed) ───────────────────────────────
if [ "${SKIP_CDK:-}" != "1" ]; then
  echo "==> Running CDK deploy..."
  cd "$REPO_ROOT/infra"
  npx cdk deploy --require-approval never
  cd "$REPO_ROOT"
fi

# ── Force new ECS deployment ────────────────────────────────────
echo "==> Rolling out new ECS deployment..."
CLUSTER=$(aws ecs list-clusters --region "$REGION" \
  --query 'clusterArns[0]' --output text)
SERVICE=$(aws ecs list-services --cluster "$CLUSTER" --region "$REGION" \
  --query 'serviceArns[0]' --output text)

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --force-new-deployment \
  --region "$REGION" \
  --query 'service.deployments[0].rolloutState' \
  --output text

# ── Wait for rollout ────────────────────────────────────────────
echo "==> Waiting for deployment to complete..."
while true; do
  STATUS=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --region "$REGION" \
    --query 'services[0].deployments[0].rolloutState' \
    --output text)
  echo "    $STATUS"
  if [ "$STATUS" = "COMPLETED" ]; then break; fi
  if [ "$STATUS" = "FAILED" ]; then
    echo "ERROR: Deployment failed. Check CloudWatch logs."
    exit 1
  fi
  sleep 15
done

# ── Print URL ───────────────────────────────────────────────────
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbDns`].OutputValue' \
  --output text)
echo ""
echo "==> Deployed successfully!"
echo "    http://$ALB_DNS"
