USE linkedin_scraper;

-- Per-user job dedupe: url is TEXT (not directly indexable), so index a stored
-- hash of it. Parser relies on this via INSERT IGNORE.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS url_hash CHAR(40) AS (SHA1(url)) STORED,
  ADD UNIQUE KEY IF NOT EXISTS uniq_jobs_user_url (user_id, url_hash),
  ADD INDEX IF NOT EXISTS idx_jobs_user_read (user_id, read_at);
