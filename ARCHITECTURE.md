# Architecture

Jev.AI is a LinkedIn job scraper plus a Claude-powered career advisor. A Next.js 16 app fronts three single-purpose Go binaries and a MariaDB database. The whole stack ships as one Docker image to AWS ECS Fargate.

> **Naming note.** The Go module (`linkedinScraper`), the CDK stack (`LinkedInScraperStack`), and the ECR repo (`linkedin-scraper`) still carry the pre-rebrand name. The runtime is Jev.AI; the infra identifiers are not.

---

## High-level shape

```
                 ┌──────────────────────── ALB :80 ────────────────────────┐
                 ▼                                                         │
        ┌─────────────────────┐                                            │
        │  Next.js 16 (App    │  execFile (async)                                 │
        │  Router, standalone)│ ───────────►  scraper  (chromedp)          │
        │                     │ ───────────►  parser   (chromedp)          │
        │  /api/**            │ ───────────►  resumeParse_Claude           │
        └──────────┬──────────┘                                            │
                   │  mysql2/promise                                       │
                   ▼                                                       │
        ┌─────────────────────┐         ┌─────────────────────┐            │
        │   RDS MariaDB 10.11 │ ◄─────  │  Go binaries        │ DB_DSN     │
        │  (linkedin_scraper) │         └─────────────────────┘            │
        └─────────────────────┘                                            │
                   ▲                                                       │
                   │                                                       │
        ┌──────────┴──────────┐                                            │
        │ Anthropic API       │  HTTPS streaming (SSE)                     │
        └─────────────────────┘ ◄──────────────────────────────────────────┘
```

Everything inside the dotted box runs as a single Fargate task (1024 CPU / 2048 MiB). Next.js serves on `:3000`; the ALB does HTTP-only termination on `:80`.

---

## Repository layout

```
Jev.AI/
├── jev.app/             Next.js 16 app (App Router, React 19, Tailwind 4, Biome)
│   └── src/
│       ├── app/
│       │   ├── (app)/   Authenticated pages: jobs, jev, profiles, settings
│       │   ├── (auth)/  login, register, verify-otp (no sidebar)
│       │   └── api/     Server routes — all per-user scoped
│       ├── lib/         auth, auth-adapter, claude, db, email helpers
│       └── proxy.ts     Auth.js route-protection middleware (named proxy.ts, not middleware.ts)
├── scraper/             scraper.go (URL harvest) + parser.go (per-job scrape)
├── resume/              resumeParse_Claude.go (PDF/DOCX → JSON via Claude)
├── claude/              Shared Go helpers used by the resume parser
├── db/                  SQL migrations (schema, auth, jev, jobs_read, jobs_dedupe, otp_attempts, seed_users)
├── locations/           GeoNames US.txt — read by the scraper
├── infra/               AWS CDK (TypeScript) — single-stack
├── Dockerfile           3-stage: go-builder → next-builder → runtime
├── docker-entrypoint.sh Idempotent migrations + node server.js
└── deploy.sh            ECR push + cdk deploy + force ECS redeploy
```

---

## Tech stack

| Layer            | Choice                                                             |
|------------------|--------------------------------------------------------------------|
| Web              | Next.js 16, React 19, App Router, `output: "standalone"`           |
| Auth             | Auth.js v5 (next-auth beta), JWT sessions, custom MySQL adapter    |
| Lint/format      | Biome 2 (no ESLint, no Prettier)                                   |
| Styling          | Tailwind 4                                                         |
| DB driver (Node) | `mysql2/promise` connection pool                                   |
| DB driver (Go)   | `github.com/go-sql-driver/mysql`                                   |
| Scraping         | `chromedp` driving headless Chromium                               |
| LLM              | Anthropic Messages API (streaming SSE), `claude-sonnet-5`          |
| DB               | MariaDB 10.11 (RDS in prod, local mariadb in dev)                  |
| Container        | Single Docker image, Node 22 base + Chromium + poppler             |
| Cloud            | ECS Fargate, ALB (HTTP), RDS MariaDB, S3, Secrets Manager, ECR     |
| IaC              | AWS CDK v2 (TypeScript), one stack                                 |

---

## Process layout (runtime)

In the Docker image:

```
/app/
├── jev.app/         Next.js standalone — process.cwd() at runtime
├── scraper/         scraper, parser binaries + per-user output_<userId>.txt scratch
├── resume/          resumeParse_Claude binary + per-user resume_<userId>.txt scratch
├── locations/US.txt GeoNames data the scraper reads
└── db/*.sql         Migrations, applied idempotently by docker-entrypoint.sh
```

Next.js API routes shell out via **async `execFile`** (never `spawnSync`/`execFileSync` — synchronous spawns block the single Node event loop for every user) and resolve binaries with `path.join(process.cwd(), "../scraper")` etc. **Do not move binaries without updating both the Dockerfile and the `execFile` paths.**

The Go module name is `linkedinScraper` and every Go file declares `package main` with a build tag (`//go:build scraper|parser|claude`). The matching tag must be passed at build time or the file is invisible to the compiler. The resume parser additionally lives behind the `claude` tag because it imports the Anthropic SDK.

---

## Data model

`db/schema.sql` defines the original single-tenant tables. `db/auth.sql` adds Auth.js tables (`users`, `accounts`, `verification_tokens`) and rewrites every domain table to be per-user.

```
users (id, email, email_verified, password, …)
  │
  ├── config        (user_id PK, resume_done, job_prefs_done, claude_api_key, last_login, subscription)
  ├── job_prefs     (user_id PK, keywords, location, distance, f_WT, f_E, f_TPR, …)
  ├── resume        (user_id PK, filename, parsed_data JSON)
  ├── jobs          (id, user_id, title, url, url_hash, description, scraped_at, read_at)
  └── jev_conversations (id UUID, user_id, title, created_at)
        └── jev_messages (id, conversation_id, role, content, created_at)
```

Notes:
- All FKs are `ON DELETE CASCADE` from `users`.
- The parser writes `jobs.user_id` directly; rows are deduped per user by the `UNIQUE (user_id, url_hash)` index (`url_hash` is a stored `SHA1(url)` generated column from `db/jobs_dedupe.sql`, which also adds an unread index on `(user_id, read_at)`).
- `jobs.read_at` is added by the (idempotent) `db/jobs_read.sql` migration.
- `verification_tokens.attempts` (from `db/otp_attempts.sql`) caps OTP guesses at 5 per email.
- `jev_messages.role` is `ENUM('user','assistant')`.

### Per-user data isolation

Every API route in `src/app/api/**` opens with:

```ts
const result = await requireAuth()
if (result instanceof NextResponse) return result
const { userId } = result
```

and **every** subsequent query is scoped `WHERE user_id = ?`. New routes must follow this pattern. `requireAuth` returns either a `{ userId }` payload or a 401 `NextResponse` — the early-return pattern keeps the happy path flat.

### Auth flow

- Auth.js v5 with `session: { strategy: "jwt" }`, custom MySQL adapter (`src/lib/auth-adapter.ts`).
- Providers: Google, GitHub, Credentials (password OR 6-digit OTP), Nodemailer OTP via Resend SMTP.
- On every successful sign-in, `ensureUserData(userId)` `INSERT IGNORE`s rows into `config`, `job_prefs`, `resume` so the user always has scaffolding.
- Route-level enforcement is `src/proxy.ts` (named `proxy.ts`, not the conventional `middleware.ts`). Its matcher allowlists `login`, `register`, `verify-otp`, `verify-email`, `api/auth`, `api/health`, `api/location`, plus Next internals. Everything else redirects unauthenticated users to `/login`.

---

## Scrape pipeline (`POST /api/scrape`)

1. **Throttle.** Skip if `config.last_login = CURDATE()` and the user already has jobs (overrideable with `{ force: true }`).
2. **`scraper` binary** — async `execFile` with `userId` as `argv[1]`, 60 s timeout. Reads `job_prefs` for the user, hits LinkedIn's `typeaheadHits` API to resolve a `geoId` for the user's location, then drives headless Chromium to LinkedIn's job-search results page. Harvests `a[href*="/jobs/view/"]` URLs, dedupes them by path, writes them to `scraper/output_<userId>.txt`.
3. **`parser` binary** — async `execFile` with `userId` as `argv[1]`, 300 s timeout. Reads `output_<userId>.txt`, skips URLs the user already has, visits each remaining job page, extracts title + description via a fallback chain of CSS selectors, and `INSERT IGNORE`s rows into `jobs` **with `user_id` set** (the `UNIQUE (user_id, url_hash)` index backstops dedupe).
4. **Mark done.** The handler runs `UPDATE config SET last_login = CURDATE()`.

Both binaries take `userId` as their first argument and every scratch file is per-user, so concurrent scrapes by different users don't interact.

### DB config split

- **Next.js** reads `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` (`src/lib/db.ts`).
- **Go binaries** read a single `DB_DSN`. `docker-entrypoint.sh` assembles it from the same vars at container start. Outside Docker, export it yourself — the binaries exit with an error if it's unset (there is deliberately no hardcoded fallback credential).

---

## Resume pipeline (`POST /api/config`)

1. Multipart upload accepts `.pdf` or `.docx` only.
2. File is written to `/app/resume/<filename>` on the local filesystem **and** mirrored to S3 (`s3://$RESUME_BUCKET/resumes/<userId>/<filename>`) when `RESUME_BUCKET` is set, since Fargate's local FS is ephemeral.
3. `pdftotext` (poppler) or an inline DOCX XML strip extracts plain text into `resume/resume_<userId>.txt`. Filenames pass through `path.basename()` first — never trust the client-supplied name.
4. `resumeParse_Claude` Go binary (async `execFile`, 60 s timeout, takes `userId` as arg) reads `resume_<userId>.txt`, sends it to the Anthropic API, and writes structured JSON into `resume.parsed_data` for that user.
5. `config.resume_done = 1`.

The resume schema (`Resume` struct in `resumeParse_Claude.go`) is fixed — name, contact, education, experience, projects, skills (frontend/backend/soft).

---

## Jev advisor (`/api/jev`)

`POST /api/jev`:

1. Resolves the Claude API key via `getClaudeApiKey(userId)` — the user's `config.claude_api_key` wins so their usage bills to them; the server-wide `CLAUDE_API_KEY` env var is the fallback.
2. Reads `resume.parsed_data` and the user's last 50 `jobs` (by `id DESC`).
3. Creates a `jev_conversations` row with a UUID and a date-stamped title; inserts the user's seed message.
4. Builds a system prompt that embeds the resume as JSON and the jobs as a numbered Markdown list (description truncated to 500 chars per job).
5. Streams `messages.create` from the Anthropic API (`claude-sonnet-5`). The system prompt carries `cache_control: {type: "ephemeral"}` — it's identical across the turns of a conversation, so follow-ups bill it at cache-read rates. The first SSE event sent to the client is `{ conversationId }`; subsequent events are `{ text }` deltas. `parseSSEStream` (`src/lib/claude.ts`) buffers the full assistant reply server-side; when the upstream stream ends — or the browser disconnects, in which case the server keeps draining Claude's stream — the buffered reply is written to `jev_messages` as the assistant turn.

`GET /api/jev` lists the user's conversations (with optional `?q=` title filter, capped at 50). `/api/jev/[id]` handles single-conversation fetch/delete and follow-up turns.

---

## API surface

All routes live under `jev.app/src/app/api/`. Unless noted, every route requires auth.

| Route                              | Methods       | Purpose                                                |
|------------------------------------|---------------|--------------------------------------------------------|
| `/api/auth/[...nextauth]`          | GET/POST      | Auth.js handlers                                       |
| `/api/auth/register`               | POST          | Email/password signup, sends verification OTP         |
| `/api/auth/verify-email`           | POST          | OTP verification for email signup                     |
| `/api/auth/resend-verification`    | POST          | Resend OTP                                            |
| `/api/auth/check-verified`         | GET           | Polled by verify-otp page                             |
| `/api/health`                      | GET           | ALB + ECS health check (unauthenticated)              |
| `/api/location`                    | GET           | Location autocomplete from `locations/US.txt` (unauth)|
| `/api/config`                      | GET/POST      | Onboarding progress + resume upload                   |
| `/api/config/jobprefs`             | GET/PUT       | Job preferences CRUD                                  |
| `/api/profile`                     | GET/PATCH     | Resume + prefs view, partial resume edit              |
| `/api/scrape`                      | POST          | Run scraper + parser pipeline                         |
| `/api/jobs`                        | GET/PATCH     | Job list (previews), detail (`?id=`), stats (`?stats=1`), mark-read |
| `/api/jev`                         | GET/POST      | List conversations / start new conversation           |
| `/api/jev/[id]`                    | GET/POST/DELETE | Conversation read, follow-up turn, delete            |

---

## Frontend layout

`src/app/layout.tsx` is a minimal HTML shell. Two route groups handle the rest:

- `src/app/(app)/layout.tsx` wraps authenticated pages with the persistent `Sidebar`. Pages: `jobs`, `jev`, `profiles`, `settings`, dashboard `page.tsx`.
- `src/app/(auth)/layout.tsx` is sidebar-less for `login`, `register`, `verify-otp`.

---

## AWS infrastructure (`infra/lib/stack.ts`)

Single CDK stack `LinkedInScraperStack`:

- **VPC** — 2 AZs, **no NAT gateway** (saves ~$32/mo). Public subnets host Fargate tasks with public IPs. Isolated subnets host RDS.
- **Security groups** — ALB allows 0.0.0.0/0 → :80, task SG allows ALB → :3000, DB SG allows task → :3306. No other ingress.
- **RDS MariaDB 10.11** — `db.t4g.micro`, single-AZ, 20 GB GP3, 7-day backups, deletion protection on, `removalPolicy: SNAPSHOT` (a `cdk destroy` requires disabling deletion protection first and leaves a final snapshot).
- **S3** — `ResumeBucket`, S3-managed encryption, `autoDeleteObjects: true`. Task role gets read/write.
- **Secrets Manager** — `DbPassword` (auto-generated), `ClaudeApiKey` (placeholder, set after first deploy), `AuthSecret` (auto-generated 44-char), `SmtpSecret` (placeholder).
- **ECR** — `linkedin-scraper` repo, lifecycle keeps last 5 images.
- **ECS Fargate** — 1 task, 1024 CPU / 2048 MiB, image `:latest`. Container health check: `curl http://localhost:3000/api/health`. ALB target health check on `/api/health`.
- **ALB** — internet-facing, HTTP only on :80. (No HTTPS termination yet — add ACM + listener if/when a domain is attached.)

Outputs: `AlbDns`, `EcrRepoUri`, `ClaudeApiKeyArn`, `DbEndpoint`.

---

## Build & deploy

- **Local frontend** — `cd jev.app && npm run dev`. Biome is the only linter/formatter (`npm run lint`, `npm run format`).
- **Local DB** — `sudo systemctl start mariadb`, then apply `schema.sql`, `auth.sql`, `jev.sql`, `jobs_read.sql`, `jobs_dedupe.sql`, `otp_attempts.sql` in order. The Docker entrypoint applies all of these idempotently in production; you only run them by hand for dev.
- **Local Go builds** — every Go file requires its build tag:
  ```bash
  go build -tags scraper -o scraper/scraper ./scraper/scraper.go
  go build -tags parser  -o scraper/parser  ./scraper/parser.go
  go build -tags claude  -o resume/resumeParse_Claude ./resume/resumeParse_Claude.go
  ```
- **Docker image** — three stages: `go-builder` (compiles all three binaries with their tags), `next-builder` (runs `next build` against the standalone output), and a slim `node:22-bookworm-slim` runtime that adds `chromium`, `poppler-utils`, `unzip`, `mariadb-client`, `curl`. Final layout is the `/app/` tree above.
- **`docker-entrypoint.sh`** is the source of truth for migration order: assembles `DB_DSN`, then for each migration checks for a sentinel table (`config`, `users`, `jev_conversations`) and applies the SQL only if missing. `jobs_read.sql`, `jobs_dedupe.sql`, `otp_attempts.sql`, and `seed_users.sql` run unconditionally because they're idempotent (`IF NOT EXISTS` / `INSERT IGNORE`). New migrations should follow one of those two patterns.
- **Deploy** — `./deploy.sh` from repo root. ECR login → `docker build` (tagged `:latest` and `:<git-sha>`) → push both tags → optional `cdk deploy` (skip with `SKIP_CDK=1`) → `aws ecs update-service --force-new-deployment` → poll `rolloutState` until `COMPLETED`. To roll back, retag a previous SHA image as `:latest` and force a new deployment. See `DEPLOY.md` for resource IDs and troubleshooting.

---

## Things to keep in mind when changing this codebase

- **Auth scoping is mandatory.** Any new API route that touches user data must call `requireAuth()` and scope every query by `user_id`. Forgetting this leaks data across users.
- **Don't move the `/app/scraper`, `/app/resume`, `/app/locations`, `/app/db` directories** without updating both the Dockerfile and the `path.join(process.cwd(), "../scraper")`-style paths in API routes.
- **Go build tags are not optional.** Every `.go` file uses one; building without `-tags <name>` produces an empty binary or a "no Go files" error.
- **Never spawn child processes synchronously from a route handler.** `spawnSync`/`execFileSync` block the Node event loop for every user; use async `execFile` (see `api/scrape` for the pattern).
- **Scratch files are per-user.** The binaries take `userId` as `argv[1]` and read/write `output_<userId>.txt` / `resume_<userId>.txt`; keep that property when touching the pipeline.
- **Migrations must be idempotent** so the Docker entrypoint can re-apply them on every container start.
- **Auth.js middleware is named `proxy.ts`, not `middleware.ts`.** Don't rename it without rewiring `next.config` accordingly.
