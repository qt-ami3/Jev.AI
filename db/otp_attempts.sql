USE linkedin_scraper;

ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
