# Jev.AI

A LinkedIn job scraper plus a Claude-powered career advisor. Scrape job
listings matched to your preferences, upload your resume, then chat with
**Jev** — an advisor that knows your background and your job feed and streams
tailored career advice.

A Next.js 16 app fronts three single-purpose Go binaries (scraper, parser,
resume parser) and a MariaDB database. The whole stack ships as one Docker
image.

> **Naming note.** The Go module (`linkedinScraper`), CDK stack
> (`LinkedInScraperStack`), and ECR repo (`linkedin-scraper`) carry the
> pre-rebrand name. The runtime is Jev.AI; the infra identifiers are not.

## Features

- **Job scraping** — headless Chromium (chromedp) harvests LinkedIn job
  listings for your keywords, location, work types, and experience levels,
  deduped per user.
- **Resume parsing** — upload a PDF/DOCX; Claude extracts it into structured
  JSON you can edit in the UI.
- **Jev advisor** — SSE-streamed Claude chat seeded with your parsed resume
  and latest jobs. Each user supplies their own Claude API key in Settings.
- **Multi-user** — Auth.js (password + email OTP), every table and API route
  scoped per user.

## Quick start (local demo)

Requires Docker and a [Claude API key](https://console.anthropic.com).

```bash
docker compose up --build
```

Open http://localhost:3000, register (email verification is skipped in demo
mode), and paste your Claude API key in Settings. Details and limitations in
[DEMO.md](DEMO.md).

## Tech stack

| Layer     | Tech                                                        |
|-----------|-------------------------------------------------------------|
| Frontend  | Next.js 16 (App Router), React 19, Tailwind 4, Biome        |
| Auth      | Auth.js v5, JWT sessions, custom MySQL adapter              |
| Backend   | Go binaries (chromedp scraping, Claude resume parsing)      |
| AI        | Anthropic API, SSE streaming, prompt caching                |
| Database  | MariaDB                                                     |
| Infra     | Docker, AWS ECS Fargate + ALB + RDS, CDK (TypeScript)       |

## Repository layout

```
jev.app/       Next.js app — pages in src/app/(app) + (auth), API in src/app/api
scraper/       scraper.go (URL harvest) + parser.go (per-job scrape)
resume/        resumeParse_Claude.go (PDF/DOCX → JSON via Claude)
claude/        Shared Go helpers for the resume parser
db/            SQL migrations, applied idempotently by docker-entrypoint.sh
locations/     GeoNames US.txt, read by the scraper
infra/         AWS CDK stack
```

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit together
- [DEMO.md](DEMO.md) — run the demo locally with Docker
- [DEPLOY.md](DEPLOY.md) — local dev setup and AWS deployment
- [CLAUDE.md](CLAUDE.md) — working conventions and common commands
