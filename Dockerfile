# Stage 1: Build Go binaries
FROM golang:1.25-bookworm AS go-builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download

COPY scraper/scraper.go scraper/
COPY scraper/parser.go scraper/
COPY resume/resumeParse_Claude.go resume/
COPY claude/ claude/
COPY db/seed.go db/

RUN CGO_ENABLED=0 go build -tags scraper -o /out/scraper ./scraper/scraper.go
RUN CGO_ENABLED=0 go build -tags parser -o /out/parser ./scraper/parser.go
RUN CGO_ENABLED=0 go build -tags claude -o /out/resumeParse_Claude ./resume/resumeParse_Claude.go

# Stage 2: Build Next.js app
FROM node:22-bookworm-slim AS next-builder

WORKDIR /build/jev.app
COPY jev.app/package.json jev.app/package-lock.json ./
RUN npm ci
COPY jev.app/ ./
RUN npm run build

# Stage 3: Runtime
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    poppler-utils \
    unzip \
    grep \
    mariadb-client \
    curl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV CHROMEDP_NO_SANDBOX=true
ENV CHROME_PATH=/usr/bin/chromium
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# Maintain directory structure so relative paths (../scraper, ../locations, etc.) work
# from process.cwd() = /app/jev.app/

# Next.js standalone output
COPY --from=next-builder /build/jev.app/.next/standalone ./jev.app/
COPY --from=next-builder /build/jev.app/.next/static ./jev.app/.next/static
COPY --from=next-builder /build/jev.app/public ./jev.app/public
COPY --from=next-builder /build/jev.app/fonts ./jev.app/fonts

# Go binaries
COPY --from=go-builder /out/scraper ./scraper/scraper
COPY --from=go-builder /out/parser ./scraper/parser
COPY --from=go-builder /out/resumeParse_Claude ./resume/resumeParse_Claude
RUN chmod +x ./scraper/scraper ./scraper/parser ./resume/resumeParse_Claude

# Static data
COPY locations/US.txt ./locations/US.txt
COPY db/schema.sql ./db/schema.sql
COPY db/auth.sql ./db/auth.sql
COPY db/jev.sql ./db/jev.sql
COPY db/jobs_read.sql ./db/jobs_read.sql
COPY db/jobs_dedupe.sql ./db/jobs_dedupe.sql
COPY db/otp_attempts.sql ./db/otp_attempts.sql
COPY db/seed_users.sql ./db/seed_users.sql

# Entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
