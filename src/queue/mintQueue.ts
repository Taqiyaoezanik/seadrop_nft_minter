import PQueue from 'p-queue';
import { config } from '../config';
import { logger } from '../utils/logger';
import { updateJobStatus, getJob } from '../db/mintJobs';
import { runMintJob } from '../mint/engine';
import type { MintJobInput, MintEngineResult } from '../mint/engine';

let bullQueue: unknown = null;

// Try to init BullMQ if Redis is configured
async function tryInitBullMQ(): Promise<void> {
  if (!config.redis.url) return;
  try {
    const { Queue } = await import('bullmq');
    const { default: IORedis } = await import('ioredis');
    const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null });
    bullQueue = new Queue('mint-jobs', { connection });
    logger.info('[QUEUE] BullMQ initialized with Redis persistence');
  } catch (err) {
    logger.warn(`[QUEUE] BullMQ init failed, using p-queue only: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

const pQueue = new PQueue({ concurrency: config.mint.queueConcurrency });

let notifyCallback: ((telegramId: string, result: MintEngineResult) => Promise<void>) | null = null;

export function setNotifyCallback(
  cb: (telegramId: string, result: MintEngineResult) => Promise<void>
): void {
  notifyCallback = cb;
}

export async function initQueue(): Promise<void> {
  await tryInitBullMQ();
  logger.info(`[QUEUE] p-queue initialized (concurrency: ${config.mint.queueConcurrency})`);
}

export async function addMintJob(
  input: MintJobInput,
  jobId?: string
): Promise<string> {
  logger.info(`[QUEUE] Adding mint job for user ${input.telegramId}`);

  pQueue.add(async () => {
    try {
      const result = await runMintJob(input);
      if (notifyCallback) {
        await notifyCallback(input.telegramId, result);
      }
    } catch (err) {
      logger.error(`[QUEUE] Unhandled error in mint job: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  });

  return jobId ?? 'queued';
}

export function getQueueStats(): { pending: number; active: number } {
  return {
    pending: pQueue.size,
    active: pQueue.pending,
  };
}

export async function cancelMintJob(jobId: string, telegramId: string): Promise<boolean> {
  const job = getJob(jobId);
  if (!job || job.telegram_id !== telegramId) return false;
  if (job.status !== 'PENDING') return false;
  updateJobStatus(jobId, 'CANCELLED');
  logger.info(`[QUEUE] Job ${jobId} cancelled by user ${telegramId}`);
  return true;
}
