# Setup & Deployment Guide

## Local Development Setup

### 1. Run the Auth Schema Migration

This creates the `users`, `accounts`, and `verification_tokens` tables, then adds `user_id` columns to existing tables for multi-user support.

```bash
mariadb -u aval -p linkedin_scraper < db/auth.sql
```

### 2. Configure Environment Variables

Edit `jev.app/.env.local` and add these variables:

```env
# Database (already set)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=aval
DB_PASSWORD=<your-password>
DB_NAME=linkedin_scraper

# Auth.js (required)
AUTH_SECRET=<generate with: openssl rand -base64 32>

# SMTP — required for email OTP login
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# OAuth — optional, leave blank to disable
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
```

**Generating AUTH_SECRET** (fish shell):

```fish
set -x AUTH_SECRET (openssl rand -base64 32)
```

### 3. Install Dependencies

```bash
cd jev.app
npm install
```

### 4. Run Dev Server

```bash
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`.

---

## Authentication System

Four sign-in methods are available:

| Method | Requirements | Notes |
|---|---|---|
| Email + Password | None beyond AUTH_SECRET | User registers at `/register`, then signs in |
| Email OTP | SMTP_* env vars configured | Sends 6-digit code, expires in 10 min |
| Google OAuth | AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET | Set up at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| GitHub OAuth | AUTH_GITHUB_ID + AUTH_GITHUB_SECRET | Set up at [GitHub Developer Settings](https://github.com/settings/developers) |

**OAuth callback URLs** (set these in provider dashboards):
- Google: `http://localhost:3000/api/auth/callback/google` (dev) / `https://yourdomain.com/api/auth/callback/google` (prod)
- GitHub: `http://localhost:3000/api/auth/callback/github` (dev) / `https://yourdomain.com/api/auth/callback/github` (prod)

---

## AWS Deployment

### Prerequisites

- AWS CLI configured (`aws configure`)
- Docker running (`sudo systemctl start docker`)
- Node.js 22+

### First-Time Infrastructure Setup

```bash
cd infra
npm install
npx cdk bootstrap
npx cdk deploy
```

This creates: VPC, RDS MariaDB, ECS Fargate cluster, ALB, ECR repo, S3 bucket, and Secrets Manager entries.

### Add Auth Secrets to AWS

After CDK deploy, add the auth-related secrets. You can either:

**Option A: Add to CDK stack** — update `infra/lib/stack.ts` to include new secrets for AUTH_SECRET, SMTP credentials, and OAuth keys, then `npx cdk deploy`.

**Option B: Set as ECS environment/secrets manually** — update the task definition's environment variables via the AWS Console or CLI.

The minimum required secrets for production:

```bash
# AUTH_SECRET — generate and store
aws secretsmanager create-secret \
  --name AuthSecret \
  --secret-string "$(openssl rand -base64 32)"

# SMTP credentials (for OTP emails)
aws secretsmanager create-secret \
  --name SmtpCredentials \
  --secret-string '{"host":"smtp.example.com","port":"587","user":"you@example.com","pass":"app-password","from":"noreply@yourdomain.com"}'
```

Then reference these in the CDK stack's task container environment/secrets, or pass them directly as ECS task definition environment variables.

### Update the Docker Entrypoint for Auth Migration

The current `docker-entrypoint.sh` only runs `schema.sql`. For the auth migration, you need to also run `auth.sql` once on first deploy with auth. Add `db/auth.sql` to the Docker image and run it after `schema.sql`:

```dockerfile
# In Dockerfile, add:
COPY db/auth.sql ./db/auth.sql
```

```bash
# In docker-entrypoint.sh, add after schema.sql initialization:
if ! mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT 1 FROM users LIMIT 1" 2>/dev/null; then
  echo "Running auth migration..."
  mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /app/db/auth.sql
  echo "Auth migration complete."
fi
```

### Push a New Image

```bash
# 1. Log in to ECR
aws ecr get-login-password --region us-east-1 | \
  sudo docker login --username AWS --password-stdin \
  655790570067.dkr.ecr.us-east-1.amazonaws.com

# 2. Build from repo root
cd /home/aval/projects/linkedinScaper
sudo docker build -t linkedin-scraper .

# 3. Tag for ECR
sudo docker tag linkedin-scraper:latest \
  655790570067.dkr.ecr.us-east-1.amazonaws.com/linkedin-scraper:latest

# 4. Push
sudo docker push \
  655790570067.dkr.ecr.us-east-1.amazonaws.com/linkedin-scraper:latest

# 5. Force ECS to pull the new image
aws ecs update-service \
  --cluster LinkedInScraperStack-ClusterEB0386A7-5u41Zw8VxrEt \
  --service LinkedInScraperStack-ServiceD69D759B-Hn0LyQduEvkd \
  --force-new-deployment
```

### After Pushing

New task takes 1-2 minutes to start and pass health checks.

```bash
# Check task status
aws ecs describe-services \
  --cluster LinkedInScraperStack-ClusterEB0386A7-5u41Zw8VxrEt \
  --service LinkedInScraperStack-ServiceD69D759B-Hn0LyQduEvkd \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'

# Check logs
aws logs tail /aws/ecs/LinkedInScraperStack --follow
```

---

## Quick Reference

| What | Value |
|---|---|
| App URL | http://Linked-Alb16-dyG23UwMony1-2135443574.us-east-1.elb.amazonaws.com |
| ECR URI | 655790570067.dkr.ecr.us-east-1.amazonaws.com/linkedin-scraper |
| Cluster | LinkedInScraperStack-ClusterEB0386A7-5u41Zw8VxrEt |
| Service | LinkedInScraperStack-ServiceD69D759B-Hn0LyQduEvkd |
| Region | us-east-1 |

## Update Secrets

```bash
# Claude API key
aws secretsmanager put-secret-value \
  --secret-id arn:aws:secretsmanager:us-east-1:655790570067:secret:ClaudeApiKey6E1BA474-Rkf7saifs3nL-lnak1m \
  --secret-string 'sk-ant-...'
```

After updating a secret, force a new deployment (step 5 above) so ECS picks it up.

## Update Infrastructure

```bash
cd infra
npx cdk diff    # preview changes
npx cdk deploy  # apply changes
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `push access denied` | Run ECR login (step 1) — token expired |
| `tag does not exist` | Run `docker tag` (step 3) before pushing |
| Task keeps restarting | Check logs: `aws logs tail /aws/ecs/LinkedInScraperStack --follow` |
| Lock file out of sync | Run `cd jev.app && npm install` before `docker build` |
| Docker permission denied | Use `sudo` or run `newgrp docker` |
| Stack in progress | Wait or delete: `aws cloudformation delete-stack --stack-name LinkedInScraperStack` |
| Auth redirect loop | Verify AUTH_SECRET is set and consistent across restarts |
| OAuth "redirect_uri_mismatch" | Check callback URL matches exactly in provider dashboard |
| OTP emails not arriving | Verify SMTP_* env vars; check spam folder |
| "Unauthorized" on API routes | Session expired — sign in again; check AUTH_SECRET hasn't changed |

## What Changed (Auth Migration Summary)

### New files
- `src/lib/auth.ts` — Auth.js v5 config (4 providers, JWT callbacks)
- `src/lib/auth-adapter.ts` — Custom mysql2 adapter for Auth.js
- `src/lib/auth-helpers.ts` — `requireAuth()` helper for API routes
- `src/lib/email.ts` — Nodemailer OTP email sender
- `src/types/next-auth.d.ts` — TypeScript augmentations
- `src/middleware.ts` — JWT route protection
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler
- `src/app/api/auth/register/route.ts` — Registration endpoint
- `src/app/(auth)/login/page.tsx` — Login page
- `src/app/(auth)/register/page.tsx` — Registration page
- `src/app/(auth)/verify-otp/page.tsx` — OTP verification page
- `db/auth.sql` — Schema migration

### Modified files
- All API routes (`config`, `jobprefs`, `jobs`, `profile`, `scrape`) — added `requireAuth()` + `WHERE user_id = ?`
- `src/app/layout.tsx` — Stripped to minimal shell
- Pages moved into `(app)/` route group with Sidebar layout
- `(auth)/` route group with centered layout (no sidebar)
- `package.json` — Added next-auth, bcryptjs, nodemailer deps
- `next.config.ts` — Added `output: "standalone"`
