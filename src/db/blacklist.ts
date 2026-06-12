import { db } from './index';

export interface BlacklistEntry {
  contract_address: string;
  reason: string | null;
  added_by: string | null;
  created_at: string;
}

export function isBlacklisted(contractAddress: string): boolean {
  const entry = db
    .prepare('SELECT contract_address FROM blacklist WHERE contract_address = ?')
    .get(contractAddress.toLowerCase());
  return entry !== undefined;
}

export function addToBlacklist(
  contractAddress: string,
  reason?: string,
  addedBy?: string
): void {
  db.prepare(
    'INSERT OR REPLACE INTO blacklist (contract_address, reason, added_by) VALUES (?, ?, ?)'
  ).run(contractAddress.toLowerCase(), reason ?? null, addedBy ?? null);
}

export function removeFromBlacklist(contractAddress: string): boolean {
  const result = db
    .prepare('DELETE FROM blacklist WHERE contract_address = ?')
    .run(contractAddress.toLowerCase());
  return result.changes > 0;
}

export function getAllBlacklisted(): BlacklistEntry[] {
  return db.prepare('SELECT * FROM blacklist ORDER BY created_at DESC').all() as BlacklistEntry[];
}
