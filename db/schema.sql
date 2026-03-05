CREATE DATABASE IF NOT EXISTS linkedin_scraper
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE linkedin_scraper;

CREATE TABLE IF NOT EXISTS config (
  id            INT         NOT NULL DEFAULT 1,
  resume_done   TINYINT(1)  NOT NULL DEFAULT 0,
  job_prefs_done TINYINT(1) NOT NULL DEFAULT 0,
  subscription  VARCHAR(255) NOT NULL DEFAULT 'n/a',
  PRIMARY KEY (id)
);
INSERT IGNORE INTO config (id) VALUES (1);

CREATE TABLE IF NOT EXISTS job_prefs (
  id                      INT          NOT NULL DEFAULT 1,
  keywords                VARCHAR(500) NOT NULL DEFAULT '',
  location                VARCHAR(500) NOT NULL DEFAULT '',
  distance                VARCHAR(50)  NOT NULL DEFAULT '50',
  f_WT                    VARCHAR(50)  NOT NULL DEFAULT '1,2,3',
  f_E                     VARCHAR(50)  NOT NULL DEFAULT '1,2',
  alert_action            VARCHAR(100) NOT NULL DEFAULT 'viewjobs',
  current_job_id          VARCHAR(100) NOT NULL DEFAULT '',
  f_TPR                   VARCHAR(50)  NOT NULL DEFAULT 'r86400',
  origin                  VARCHAR(100) NOT NULL DEFAULT 'JOB_SEARCH_PAGE_JOB_FILTER',
  sort_by                 VARCHAR(10)  NOT NULL DEFAULT 'R',
  spell_correction_enabled TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
);
INSERT IGNORE INTO job_prefs (id) VALUES (1);

CREATE TABLE IF NOT EXISTS jobs (
  id          INT          NOT NULL AUTO_INCREMENT,
  title       VARCHAR(500) NOT NULL DEFAULT '',
  url         TEXT         NOT NULL,
  description LONGTEXT     NOT NULL DEFAULT '',
  scraped_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS resume (
  id          INT          NOT NULL DEFAULT 1,
  filename    VARCHAR(500) NOT NULL DEFAULT '',
  parsed_data JSON,
  PRIMARY KEY (id)
);
INSERT IGNORE INTO resume (id) VALUES (1);
