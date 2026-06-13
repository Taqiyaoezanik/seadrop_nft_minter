import { db } from './index';
import { logger } from '../utils/logger';

export interface ScheduledMint {
  id: string;
  telegram_id: string;
  url: string;
  scheduled_time: string;
  quantity: number;
  wallet_from?: number;
  wallet_to?: number;
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'FAILED';
  job_id?: string;
  error_message?: string;
  created_at: string;
  executed_at?: string;
}

export function createScheduledMint(data: {
  id: string;
  telegram_id: string;
  url: string;
  scheduled_time: string;
  quantity?: number;
  wallet_from?: number;
  wallet_to?: number;
}): void {
  const stmt = db.prepare(`
    INSERT INTO scheduled_mints (id, telegram_id, url, scheduled_time, quantity, wallet_from, wallet_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.id,
    data.telegram_id,
    data.url,
    data.scheduled_time,
    data.quantity ?? 1,
    data.wallet_from ?? null,
    data.wallet_to ?? null
  );
  logger.info(`[DB] Created scheduled mint ${data.id} for ${data.telegram_id}`);
}

export function getScheduledMint(id: string): ScheduledMint | undefined {
  const stmt = db.prepare('SELECT * FROM scheduled_mints WHERE id = ?');
  return stmt.get(id) as ScheduledMint | undefined;
}

export function getUserScheduledMints(telegramId: string, status?: string): ScheduledMint[] {
  let query = 'SELECT * FROM scheduled_mints WHERE telegram_id = ?';
  const params: any[] = [telegramId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY scheduled_time ASC';

  const stmt = db.prepare(query);
  return stmt.all(...params) as ScheduledMint[];
}

export function getPendingScheduledMints(): ScheduledMint[] {
  const stmt = db.prepare(`
    SELECT * FROM scheduled_mints
    WHERE status = 'PENDING'
    AND datetime(scheduled_time) <= datetime('now')
    ORDER BY scheduled_time ASC
  `);
  return stmt.all() as ScheduledMint[];
}

export function updateScheduledMintStatus(
  id: string,
  status: ScheduledMint['status'],
  updates?: { job_id?: string; error_message?: string; executed_at?: string }
): void {
  const fields = ['status = ?'];
  const params: any[] = [status];

  if (updates?.job_id) {
    fields.push('job_id = ?');
    params.push(updates.job_id);
  }

  if (updates?.error_message) {
    fields.push('error_message = ?');
    params.push(updates.error_message);
  }

  if (updates?.executed_at) {
    fields.push('executed_at = ?');
    params.push(updates.executed_at);
  }

  params.push(id);

  const stmt = db.prepare(`
    UPDATE scheduled_mints
    SET ${fields.join(', ')}
    WHERE id = ?
  `);
  stmt.run(...params);
  logger.info(`[DB] Updated scheduled mint ${id} to status ${status}`);
}

export function cancelScheduledMint(id: string): boolean {
  const scheduled = getScheduledMint(id);
  if (!scheduled || scheduled.status !== 'PENDING') {
    return false;
  }

  updateScheduledMintStatus(id, 'CANCELLED');
  return true;
}

export function deleteOldScheduledMints(olderThanDays: number = 7): number {
  const stmt = db.prepare(`
    DELETE FROM scheduled_mints
    WHERE datetime(created_at) < datetime('now', '-${olderThanDays} days')
    AND status IN ('EXECUTED', 'CANCELLED', 'FAILED')
  `);
  const result = stmt.run();
  logger.info(`[DB] Deleted ${result.changes} old scheduled mints`);
  return result.changes;
}
