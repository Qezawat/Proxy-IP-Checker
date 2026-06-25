-- The North Panel — D1 Schema
-- Run once: wrangler d1 execute north-panel --file=schema.sql
-- Or paste in Cloudflare Dashboard → D1 → your DB → Console

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  uuid   TEXT NOT NULL,
  quota  INTEGER DEFAULT 0,
  used   INTEGER DEFAULT 0,
  expiry TEXT DEFAULT '',
  enable INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clean_ips (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ip   TEXT NOT NULL,
  port INTEGER DEFAULT 443,
  tag  TEXT DEFAULT ''
);

-- Default config values (optional — panel sets these via UI)
INSERT OR IGNORE INTO config (key, value) VALUES ('ws_path', '/vless');
INSERT OR IGNORE INTO config (key, value) VALUES ('port', '443');
INSERT OR IGNORE INTO config (key, value) VALUES ('fingerprint', 'chrome');
INSERT OR IGNORE INTO config (key, value) VALUES ('proxy_name', 'NorthPanel');
