import PQueue from 'p-queue';
import { config } from '../config';
import { logger } from '../utils/logger';
import { updateJobStatus, getJob } from '../db/mintJobs';
import { runMintJob } from '../mint/engine';
import type { MintJobInput, MintEngineResult } from '../mint/engine';

let _bullQueueInitialized = false;

async function tryInitBullMQ(): Promise<void> {
  if (!config.redis.url || _bullQueueInitialized) return;
  try {
    const { Queue } = await import('bullmq');
    const redisUrl = new URL(config.redis.url!);
    new Queue('mint-jobs', {
      connection: {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: redisUrl.password || undefined,
        maxRetriesPerRequest: null,
      },
    });
    _bullQueueInitialized = true;
    logger.info('[QUEUE] BullMQ initialized with Redis persistence');
  } catch (err) {
    logger.warn(
      `[QUEUE] BullMQ init failed, using p-queue only: ${err instanceof Error ? err.message : 'unknown'}`
    );
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
  input: Omit<MintJobInput, 'jobId'> & { jobId: string },
  jobId: string
): Promise<string> {
  logger.info(`[QUEUE] Adding mint job ${jobId} for user ${input.telegramId}`);

  pQueue.add(async () => {
    try {
      const result = await runMintJob({ ...input, jobId });
      if (notifyCallback) {
        await notifyCallback(input.telegramId, result);
      }
    } catch (err) {
      logger.error(
        `[QUEUE] Unhandled error in mint job ${jobId}: ${err instanceof Error ? err.message : 'unknown'}`
      );
    }
  }).catch((err: unknown) => {
    logger.error(
      `[QUEUE] Failed to add job to queue: ${err instanceof Error ? err.message : 'unknown'}`
    );
  });

  return jobId;
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
