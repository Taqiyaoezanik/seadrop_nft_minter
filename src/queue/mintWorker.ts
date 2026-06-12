import { logger } from '../utils/logger';
import { initQueue, setNotifyCallback } from './mintQueue';
import type { MintEngineResult } from '../mint/engine';
import type { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { mintSuccess, mintFailed, mintDropped } from '../notifications/templates';
import { getJob } from '../db/mintJobs';

export async function initWorker(bot: Telegraf<Context>): Promise<void> {
  await initQueue();

  setNotifyCallback(async (telegramId: string, result: MintEngineResult) => {
    try {
      const job = result.jobId ? getJob(result.jobId) : null;
      let message: string;

      if (result.status === 'CONFIRMED') {
        message = mintSuccess({
          collectionName: result.collectionName ?? 'Unknown',
          tokenIds: result.tokenIds ?? [],
          mintPriceEth: job?.mint_price_eth ?? '0',
          gasUsedEth: result.gasUsedEth ?? '0',
          txHash: result.txHash ?? '',
          walletAddress: job?.wallet_address ?? '',
        });
      } else if (result.status === 'DROPPED') {
        message = mintDropped({
          collectionName: result.collectionName ?? 'Unknown',
          txHash: result.txHash ?? '',
          jobId: result.jobId,
          walletAddress: job?.wallet_address ?? '',
        });
      } else {
        message = mintFailed({
          collectionName: result.collectionName ?? 'Unknown',
          reason: result.errorMessage ?? 'Unknown error',
          jobId: result.jobId,
          walletAddress: job?.wallet_address ?? '',
        });
      }

      await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error(`[WORKER] Failed to send notification: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  });

  logger.info('[WORKER] Mint worker initialized');
}
