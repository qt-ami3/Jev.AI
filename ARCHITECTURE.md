# Architecture

Jev.AI is a LinkedIn job scraper plus a Claude-powered career advisor. A Next.js 16 app fronts three single-purpose Go binaries and a MariaDB database. The whole stack ships as one Docker image to AWS ECS Fargate.

> **Naming note.** The Go module (`linkedinScraper`), the CDK stack (`LinkedInScraperStack`), and the ECR repo (`linkedin-scraper`) still carry the pre-rebrand name. The runtime is Jev.AI; the infra identifiers are not.

---

## High-level shape

```
                 ┌──────────────────────── ALB :80 ────────────────────────┐
                 ▼                                                         │
        ┌─────────────────────┐                                            │
        │  Next.js 16 (App    │  spawnSync                                 │
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
├── db/                  SQL migrations (schema, auth, jev, jobs_read, seed_users)
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
| LLM              | Anthropic Messages API (streaming SSE), `claude-sonnet-4-20250514` |
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
├── scraper/         scraper, parser binaries + output.txt scratch space
├── resume/          resumeParse_Claude binary + scratch space
├── locations/US.txt GeoNames data the scraper reads
└── db/*.sql         Migrations, applied idempotently by docker-entrypoint.sh
```

Next.js API routes shell out via `spawnSync` and resolve binaries with `path.join(process.cwd(), "../scraper")` etc. **Do not move binaries without updating both the Dockerfile and the `spawnSync` paths.**

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
  ├── jobs          (id, user_id NULLABLE, title, url, description, scraped_at, read_at)
  └── jev_conversations (id UUID, user_id, title, created_at)
        └── jev_messages (id, conversation_id, role, content, created_at)
```

Notes:
- All FKs are `ON DELETE CASCADE` from `users`.
- `jobs.user_id` is **nullable** by design — see "Scrape pipeline" below.
- `jobs.read_at` is added by the (idempotent) `db/jobs_read.sql` migration.
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
2. **`scraper` binary** — `spawnSync` with `userId` as `argv[1]`, 60 s timeout. Reads `job_prefs` for the user, hits LinkedIn's `typeaheadHits` API to resolve a `geoId` for the user's location, then drives headless Chromium to LinkedIn's job-search results page. Harvests `a[href*="/jobs/view/"]` URLs, dedupes them by path, writes them to `scraper/output.txt`.
3. **`parser` binary** — `spawnSync` with no args, 300 s timeout. Reads `output.txt`, skips URLs already in `jobs`, visits each remaining job page, extracts title + description via a fallback chain of CSS selectors, and `INSERT`s rows into `jobs` **with `user_id = NULL`**.
4. **Claim.** The Next.js handler runs `UPDATE jobs SET user_id = ? WHERE user_id IS NULL`, claiming the just-inserted rows for the calling user. Then `UPDATE config SET last_login = CURDATE()`.

### Known concurrency limitation

The `NULL → claim` handoff is **not safe under concurrent scrapes**. If user A's parser is mid-flight when user B's claim runs, B will sweep up A's still-unclaimed rows. There is no row-level locking, no ownership column written by the parser, and no per-user output file. The CLAUDE.md guidance is: treat this as a known limitation; if you change the scraper interface, preserve the claim semantics or replace them outright (e.g., write `user_id` directly from the parser, or scope `output.txt` per user).

### DB config split

- **Next.js** reads `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` (`src/lib/db.ts`).
- **Go binaries** read a single `DB_DSN`. `docker-entrypoint.sh` assembles it from the same vars at container start. Outside Docker, the Go code falls back to a hardcoded dev DSN (`aval:Lol123456789!@…`) — that's a local-dev convenience, not a production credential.

---

## Resume pipeline (`POST /api/config`)

1. Multipart upload accepts `.pdf` or `.docx` only.
2. File is written to `/app/resume/<filename>` on the local filesystem **and** mirrored to S3 (`s3://$RESUME_BUCKET/resumes/<userId>/<filename>`) when `RESUME_BUCKET` is set, since Fargate's local FS is ephemeral.
3. `pdftotext` (poppler) or an inline DOCX XML strip extracts plain text into `resume/resume.txt`.
4. `resumeParse_Claude` Go binary (`spawnSync`, 60 s timeout, takes `userId` as arg) sends the text to the Anthropic API and writes structured JSON into `resume.parsed_data` for that user.
5. `config.resume_done = 1`.

The resume schema (`Resume` struct in `resumeParse_Claude.go`) is fixed — name, contact, education, experience, projects, skills (frontend/backend/soft).

---

## Jev advisor (`/api/jev`)

`POST /api/jev`:

1. Resolves the Claude API key via `getClaudeApiKey(userId)` — env `CLAUDE_API_KEY` wins if set and not the placeholder, else `config.claude_api_key` for that user.
2. Reads `resume.parsed_data` and the user's last 50 `jobs` (by `id DESC`).
3. Creates a `jev_conversations` row with a UUID and a date-stamped title; inserts the user's seed message.
4. Builds a system prompt that embeds the resume as JSON and the jobs as a numbered Markdown list (description truncated to 500 chars per job).
5. Streams `messages.create` from the Anthropic API. The first SSE event sent to the client is `{ conversationId }`; subsequent events are `{ text }` deltas. `parseSSEStream` (`src/lib/claude.ts`) buffers the full assistant reply server-side; once the upstream stream ends, the buffered reply is written to `jev_messages` as the assistant turn.

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
| `/api/jobs`                        | GET/PATCH     | Job listing, dashboard stats (`?stats=1`), mark-read  |
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
- **RDS MariaDB 10.11** — `db.t4g.micro`, single-AZ, 20 GB GP3, 1-day backups, `removalPolicy: DESTROY` (dev-grade durability).
- **S3** — `ResumeBucket`, S3-managed encryption, `autoDeleteObjects: true`. Task role gets read/write.
- **Secrets Manager** — `DbPassword` (auto-generated), `ClaudeApiKey` (placeholder, set after first deploy), `AuthSecret` (auto-generated 44-char), `SmtpSecret` (placeholder).
- **ECR** — `linkedin-scraper` repo, lifecycle keeps last 5 images.
- **ECS Fargate** — 1 task, 1024 CPU / 2048 MiB, image `:latest`. Container health check: `curl http://localhost:3000/api/health`. ALB target health check on `/api/health`.
- **ALB** — internet-facing, HTTP only on :80. (No HTTPS termination yet — add ACM + listener if/when a domain is attached.)

Outputs: `AlbDns`, `EcrRepoUri`, `ClaudeApiKeyArn`, `DbEndpoint`.

---

## Build & deploy

- **Local frontend** — `cd jev.app && npm run dev`. Biome is the only linter/formatter (`npm run lint`, `npm run format`).
- **Local DB** — `sudo systemctl start mariadb`, then apply `schema.sql`, `auth.sql`, `jev.sql`, `jobs_read.sql` in order. The Docker entrypoint applies all of these idempotently in production; you only run them by hand for dev.
- **Local Go builds** — every Go file requires its build tag:
  ```bash
  go build -tags scraper -o scraper/scraper ./scraper/scraper.go
  go build -tags parser  -o scraper/parser  ./scraper/parser.go
  go build -tags claude  -o resume/resumeParse_Claude ./resume/resumeParse_Claude.go
  ```
- **Docker image** — three stages: `go-builder` (compiles all three binaries with their tags), `next-builder` (runs `next build` against the standalone output), and a slim `node:22-bookworm-slim` runtime that adds `chromium`, `poppler-utils`, `unzip`, `mariadb-client`, `curl`. Final layout is the `/app/` tree above.
- **`docker-entrypoint.sh`** is the source of truth for migration order: assembles `DB_DSN`, then for each migration checks for a sentinel table (`config`, `users`, `jev_conversations`) and applies the SQL only if missing. `jobs_read.sql` and `seed_users.sql` run unconditionally because they're idempotent. New migrations should follow this "check sentinel → apply" pattern.
- **Deploy** — `./deploy.sh` from repo root. ECR login → `docker build` → push → optional `cdk deploy` (skip with `SKIP_CDK=1`) → `aws ecs update-service --force-new-deployment` → poll `rolloutState` until `COMPLETED`. See `DEPLOY.md` for resource IDs and troubleshooting.

---

## Things to keep in mind when changing this codebase

- **Auth scoping is mandatory.** Any new API route that touches user data must call `requireAuth()` and scope every query by `user_id`. Forgetting this leaks data across users.
- **Don't move the `/app/scraper`, `/app/resume`, `/app/locations`, `/app/db` directories** without updating both the Dockerfile and the `path.join(process.cwd(), "../scraper")`-style paths in API routes.
- **Go build tags are not optional.** Every `.go` file uses one; building without `-tags <name>` produces an empty binary or a "no Go files" error.
- **The `jobs.user_id IS NULL` claim is racy.** See "Known concurrency limitation" above. Don't add new code that depends on the race window staying small.
- **Migrations must be idempotent** so the Docker entrypoint can re-apply them on every container start.
- **Auth.js middleware is named `proxy.ts`, not `middleware.ts`.** Don't rename it without rewiring `next.config` accordingly.
