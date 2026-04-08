USE linkedin_scraper;

-- Auth.js required tables
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified TIMESTAMP NULL,
  image VARCHAR(500),
  password VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INT,
  token_type VARCHAR(50),
  scope VARCHAR(255),
  id_token TEXT,
  UNIQUE KEY provider_account (provider, provider_account_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires TIMESTAMP NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Clear old single-user data (will be recreated per-user on sign-in)
DELETE FROM config;
DELETE FROM job_prefs;
DELETE FROM resume;
DELETE FROM jobs;

-- Migrate existing tables to support multi-user

ALTER TABLE config
  DROP PRIMARY KEY,
  DROP COLUMN id,
  ADD COLUMN user_id VARCHAR(36) NOT NULL,
  ADD PRIMARY KEY (user_id),
  ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE job_prefs
  DROP PRIMARY KEY,
  DROP COLUMN id,
  ADD COLUMN user_id VARCHAR(36) NOT NULL,
  ADD PRIMARY KEY (user_id),
  ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE resume
  DROP PRIMARY KEY,
  DROP COLUMN id,
  ADD COLUMN user_id VARCHAR(36) NOT NULL,
  ADD PRIMARY KEY (user_id),
  ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE jobs
  ADD COLUMN user_id VARCHAR(36),
  ADD INDEX idx_jobs_user (user_id),
  ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
