import { db } from './index';

export interface AuditLog {
  id: number;
  telegram_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export function logAction(
  telegramId: string | null,
  action: string,
  details?: Record<string, unknown> | string
): void {
  const detailsStr =
    details === undefined
      ? null
      : typeof details === 'string'
      ? details
      : JSON.stringify(details);

  db.prepare(
    'INSERT INTO audit_logs (telegram_id, action, details) VALUES (?, ?, ?)'
  ).run(telegramId, action, detailsStr);
}

export function getRecentLogs(limit = 50): AuditLog[] {
  return db.prepare(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as AuditLog[];
}
