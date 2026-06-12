import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  CREATE_USERS_TABLE,
  CREATE_MINT_JOBS_TABLE,
  CREATE_BLACKLIST_TABLE,
  CREATE_AUDIT_LOGS_TABLE,
  CREATE_UPDATED_AT_TRIGGER,
  CREATE_INDEXES,
} from './schema';
import { logger } from '../utils/logger';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'bot.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeSchema(): void {
  db.exec(CREATE_USERS_TABLE);
  db.exec(CREATE_MINT_JOBS_TABLE);
  db.exec(CREATE_BLACKLIST_TABLE);
  db.exec(CREATE_AUDIT_LOGS_TABLE);
  db.exec(CREATE_UPDATED_AT_TRIGGER);
  db.exec(CREATE_INDEXES);
  logger.info('[DB] Schema initialized successfully');
}

initializeSchema();

export { db };
