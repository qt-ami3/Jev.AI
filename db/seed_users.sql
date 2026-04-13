USE linkedin_scraper;

-- Pre-seed authorized users (idempotent — skips if email already exists)

INSERT IGNORE INTO users (id, name, email, email_verified, password)
VALUES (UUID(), 'Jacob', 'jacob@AlexiosRobotics.com', NOW(), '$2b$12$siBE4fIzQrU79woBiB4LBecBoKXD5pOyTPK6niGergmpCf2V/3ERK');

-- Initialize user data rows (config, job_prefs, resume)
INSERT IGNORE INTO config (user_id)
  SELECT id FROM users WHERE email = 'jacob@AlexiosRobotics.com';
INSERT IGNORE INTO job_prefs (user_id)
  SELECT id FROM users WHERE email = 'jacob@AlexiosRobotics.com';
INSERT IGNORE INTO resume (user_id)
  SELECT id FROM users WHERE email = 'jacob@AlexiosRobotics.com';
