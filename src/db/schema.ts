export const CREATE_USERS_TABLE = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  settings_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`;

export const CREATE_MINT_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS mint_jobs (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  collection_name TEXT,
  contract_address TEXT,
  seadrop_address TEXT,
  wallet_address TEXT,
  quantity INTEGER,
  mint_price_eth TEXT,
  status TEXT DEFAULT 'PENDING',
  tx_hash TEXT,
  token_ids TEXT,
  gas_used_eth TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`;

export const CREATE_BLACKLIST_TABLE = `
CREATE TABLE IF NOT EXISTS blacklist (
  contract_address TEXT PRIMARY KEY,
  reason TEXT,
  added_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`;

export const CREATE_AUDIT_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT,
  action TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`;

export const CREATE_UPDATED_AT_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS update_mint_jobs_updated_at
AFTER UPDATE ON mint_jobs
BEGIN
  UPDATE mint_jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END
`;
