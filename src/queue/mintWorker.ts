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

        // For large wallet counts, show summary + sample results to avoid message size limit
        const MAX_DETAILS = 20;
        const showDetails = result.walletResults.length <= MAX_DETAILS;

        let detailsSection = '';
        if (showDetails) {
          const lines = result.walletResults.map(r => {
            const emoji = r.status === 'CONFIRMED' ? '✅' : r.status === 'DROPPED' ? '⏳' : '❌';
            const shortAddr = `${r.walletAddress.slice(0, 6)}...${r.walletAddress.slice(-4)}`;
            const txInfo = r.txHash ? ` | <a href="https://etherscan.io/tx/${r.txHash}">${r.txHash.slice(0, 8)}...</a>` : '';
            const tokenInfo = r.tokenIds && r.tokenIds.length > 0 ? ` | Token: ${r.tokenIds.join(', ')}` : '';
            const errorInfo = r.errorMessage ? ` | ${r.errorMessage.slice(0, 30)}` : '';
            return `${emoji} #${r.walletIndex} <code>${shortAddr}</code>${txInfo}${tokenInfo}${errorInfo}`;
          });
          detailsSection = `<b>Results</b>\n${lines.join('\n')}\n\n`;
        } else {
          // Show only successful and first 5 failed
          const successfulWallets = result.walletResults.filter(r => r.status === 'CONFIRMED');
          const failedWallets = result.walletResults.filter(r => r.status !== 'CONFIRMED');

          const successLines = successfulWallets.slice(0, 5).map(r => {
            const shortAddr = `${r.walletAddress.slice(0, 6)}...${r.walletAddress.slice(-4)}`;
            const txInfo = r.txHash ? ` | <a href="https://etherscan.io/tx/${r.txHash}">${r.txHash.slice(0, 8)}...</a>` : '';
            return `✅ #${r.walletIndex} <code>${shortAddr}</code>${txInfo}`;
          });

          const failedLines = failedWallets.slice(0, 5).map(r => {
            const emoji = r.status === 'DROPPED' ? '⏳' : '❌';
            const shortAddr = `${r.walletAddress.slice(0, 6)}...${r.walletAddress.slice(-4)}`;
            const errorInfo = r.errorMessage ? ` | ${r.errorMessage.slice(0, 30)}` : '';
            return `${emoji} #${r.walletIndex} <code>${shortAddr}</code>${errorInfo}`;
          });

          let sampleSection = '';
          if (successLines.length > 0) {
            sampleSection += `<b>Sample Success (${Math.min(5, successfulWallets.length)}/${successfulWallets.length})</b>\n${successLines.join('\n')}\n`;
          }
          if (failedLines.length > 0) {
            sampleSection += `\n<b>Sample Failed (${Math.min(5, failedWallets.length)}/${failedWallets.length})</b>\n${failedLines.join('\n')}\n`;
          }

          detailsSection = sampleSection + `\n<i>Check logs for full details</i>\n\n`;
        }

        message =
          `🚀 <b>Multi-Wallet Mint Complete</b>\n\n` +
          `Collection: <b>${result.collectionName ?? 'Unknown'}</b>\n` +
          `Total Wallets: <b>${result.walletResults.length}</b>\n\n` +
          `<b>Summary</b>\n` +
          `✅ Success: <b>${successCount}</b>\n` +
          `❌ Failed: <b>${failedCount}</b>\n` +
          `⏳ Dropped: <b>${droppedCount}</b>\n\n` +
          detailsSection +
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
