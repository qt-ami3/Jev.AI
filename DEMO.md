# Local demo

Run the whole app (Next.js + Go binaries + MariaDB) on a local machine with
Docker — no AWS, no SMTP server, no shared Claude key. Each user pastes their
own Claude API key into Settings.

## Prerequisites

- Docker with the compose plugin
- A Claude API key from https://console.anthropic.com (each user brings their own)

## Run it

```bash
docker compose up --build
```

Then open http://localhost:3000.

## First steps

1. **Register** an account. `DEMO_MODE=1` skips email verification (there is no
   SMTP server locally), so you land straight on the login page — sign in with
   your password.
2. **Settings → Claude API key** — paste your key. It is stored per-user in
   `config.claude_api_key` and used by the Jev advisor and resume parsing.
3. Upload a resume and set job preferences on the TS page, scrape jobs, then
   chat with Jev.

## Demo limitations

- The "Email code" login tab and OTP flows don't work (no SMTP configured) —
  use password login.
- Google/GitHub OAuth buttons are not configured.
- Scraping drives a headless Chromium against real LinkedIn from your machine.
- Data persists in the `db-data` Docker volume. Full reset:
  `docker compose down -v`.

`DEMO_MODE` only changes registration (auto-verifies the email, sends nothing).
Production deploys (`deploy.sh` → ECS) don't set it, so nothing changes there.
