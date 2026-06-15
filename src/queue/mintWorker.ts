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

      // Multi-wallet mint result
      if (result.walletResults && result.walletResults.length > 0) {
        const successCount = result.walletResults.filter(r => r.status === 'CONFIRMED').length;
        const failedCount = result.walletResults.filter(r => r.status === 'FAILED').length;
        const droppedCount = result.walletResults.filter(r => r.status === 'DROPPED').length;

        const lines = result.walletResults.map(r => {
          const emoji = r.status === 'CONFIRMED' ? '✅' : r.status === 'DROPPED' ? '⏳' : '❌';
          const shortAddr = `${r.walletAddress.slice(0, 6)}...${r.walletAddress.slice(-4)}`;
          const txInfo = r.txHash ? ` | <code>${r.txHash.slice(0, 10)}...</code>` : '';
          const tokenInfo = r.tokenIds && r.tokenIds.length > 0 ? ` | Token: ${r.tokenIds.join(', ')}` : '';
          const errorInfo = r.errorMessage ? ` | ${r.errorMessage.slice(0, 40)}` : '';
          return `${emoji} Wallet #${r.walletIndex} <code>${shortAddr}</code>${txInfo}${tokenInfo}${errorInfo}`;
        });

        message =
          `🚀 <b>Multi-Wallet Mint Complete</b>\n\n` +
          `Collection: <b>${result.collectionName ?? 'Unknown'}</b>\n\n` +
          `<b>Summary</b>\n` +
          `✅ Success: <b>${successCount}</b>\n` +
          `❌ Failed: <b>${failedCount}</b>\n` +
          `⏳ Dropped: <b>${droppedCount}</b>\n\n` +
          `<b>Results</b>\n${lines.join('\n')}\n\n` +
          `Job ID: <code>${result.jobId}</code>`;
      } else {
        // Single-wallet mint result (original behavior)
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
      }

      await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error(`[WORKER] Failed to send notification: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  });

  logger.info('[WORKER] Mint worker initialized');
}
