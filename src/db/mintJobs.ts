import { db } from './index';

export type MintJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED'
  | 'DROPPED';

export interface MintJob {
  id: string;
  telegram_id: string;
  collection_name: string | null;
  contract_address: string | null;
  seadrop_address: string | null;
  wallet_address: string | null;
  quantity: number | null;
  mint_price_eth: string | null;
  status: MintJobStatus;
  tx_hash: string | null;
  token_ids: string | null;
  gas_used_eth: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobInput {
  id: string;
  telegram_id: string;
  collection_name?: string;
  contract_address?: string;
  seadrop_address?: string;
  wallet_address?: string;
  quantity?: number;
  mint_price_eth?: string;
}

export function createJob(input: CreateJobInput): MintJob {
  db.prepare(`
    INSERT INTO mint_jobs (
      id, telegram_id, collection_name, contract_address,
      seadrop_address, wallet_address, quantity, mint_price_eth, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
  `).run(
    input.id,
    input.telegram_id,
    input.collection_name ?? null,
    input.contract_address ?? null,
    input.seadrop_address ?? null,
    input.wallet_address ?? null,
    input.quantity ?? null,
    input.mint_price_eth ?? null
  );

  return db.prepare('SELECT * FROM mint_jobs WHERE id = ?').get(input.id) as MintJob;
}

export function updateJobStatus(
  jobId: string,
  status: MintJobStatus,
  extras?: {
    tx_hash?: string;
    token_ids?: string[];
    gas_used_eth?: string;
    error_message?: string;
    wallet_address?: string;
    seadrop_address?: string;
    collection_name?: string;
    contract_address?: string;
    mint_price_eth?: string;
  }
): void {
  const fields: string[] = ['status = ?'];
  const values: unknown[] = [status];

  if (extras?.tx_hash !== undefined) { fields.push('tx_hash = ?'); values.push(extras.tx_hash); }
  if (extras?.token_ids !== undefined) { fields.push('token_ids = ?'); values.push(JSON.stringify(extras.token_ids)); }
  if (extras?.gas_used_eth !== undefined) { fields.push('gas_used_eth = ?'); values.push(extras.gas_used_eth); }
  if (extras?.error_message !== undefined) { fields.push('error_message = ?'); values.push(extras.error_message); }
  if (extras?.wallet_address !== undefined) { fields.push('wallet_address = ?'); values.push(extras.wallet_address); }
  if (extras?.seadrop_address !== undefined) { fields.push('seadrop_address = ?'); values.push(extras.seadrop_address); }
  if (extras?.collection_name !== undefined) { fields.push('collection_name = ?'); values.push(extras.collection_name); }
  if (extras?.contract_address !== undefined) { fields.push('contract_address = ?'); values.push(extras.contract_address); }
  if (extras?.mint_price_eth !== undefined) { fields.push('mint_price_eth = ?'); values.push(extras.mint_price_eth); }

  values.push(jobId);
  db.prepare(`UPDATE mint_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getJob(jobId: string): MintJob | undefined {
  return db.prepare('SELECT * FROM mint_jobs WHERE id = ?').get(jobId) as MintJob | undefined;
}

export function getActiveJobs(telegramId: string): MintJob[] {
  return db.prepare(
    "SELECT * FROM mint_jobs WHERE telegram_id = ? AND status IN ('PENDING', 'PROCESSING') ORDER BY created_at DESC"
  ).all(telegramId) as MintJob[];
}

export function getAllActiveJobs(): MintJob[] {
  return db.prepare(
    "SELECT * FROM mint_jobs WHERE status IN ('PENDING', 'PROCESSING') ORDER BY created_at ASC"
  ).all() as MintJob[];
}

export function getJobHistory(telegramId: string, limit = 20): MintJob[] {
  return db.prepare(
    'SELECT * FROM mint_jobs WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(telegramId, limit) as MintJob[];
}

export function cancelJob(jobId: string, telegramId: string): boolean {
  const job = getJob(jobId);
  if (!job || job.telegram_id !== telegramId) return false;
  if (job.status !== 'PENDING') return false;
  updateJobStatus(jobId, 'CANCELLED');
  return true;
}

export function getAdminStats(): {
  total: number;
  confirmed: number;
  failed: number;
  dropped: number;
  successRate: string;
} {
  const total = (db.prepare('SELECT COUNT(*) as count FROM mint_jobs').get() as { count: number }).count;
  const confirmed = (db.prepare("SELECT COUNT(*) as count FROM mint_jobs WHERE status = 'CONFIRMED'").get() as { count: number }).count;
  const failed = (db.prepare("SELECT COUNT(*) as count FROM mint_jobs WHERE status = 'FAILED'").get() as { count: number }).count;
  const dropped = (db.prepare("SELECT COUNT(*) as count FROM mint_jobs WHERE status = 'DROPPED'").get() as { count: number }).count;
  const successRate = total > 0 ? ((confirmed / total) * 100).toFixed(1) + '%' : 'N/A';
  return { total, confirmed, failed, dropped, successRate };
}
