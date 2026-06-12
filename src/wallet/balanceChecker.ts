import { formatEther } from 'viem';
import { walletPool } from './pool';
import { config } from '../config';
import { logger } from '../utils/logger';
import { notifyLowBalance } from '../notifications/templates';
import type { Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let botInstance: Telegraf<Update & { message: { text: string } }> | null = null;

export function startBalanceChecker(bot: Telegraf<Update & { message: { text: string } }>): void {
  botInstance = bot as unknown as typeof botInstance;
  if (intervalHandle) return;

  intervalHandle = setInterval(async () => {
    await checkBalances();
  }, CHECK_INTERVAL_MS);

  logger.info('[BALANCE] Balance checker started (interval: 5 min)');
}

export function stopBalanceChecker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export async function checkBalances(): Promise<void> {
  try {
    await walletPool.updateBalances();
    const threshold = config.mint.lowBalanceThresholdEth;
    const lowWallets = walletPool.getLowBalanceWallets(threshold);

    for (const wallet of lowWallets) {
      logger.warn(`[BALANCE] Low balance on wallet ${wallet.address}: ${wallet.balanceEth} ETH`);

      if (botInstance) {
        const message = notifyLowBalance({
          address: wallet.address,
          balanceEth: wallet.balanceEth,
          thresholdEth: threshold,
        });
        try {
          await (botInstance as unknown as { telegram: { sendMessage: (id: string, msg: string, opts: Record<string, unknown>) => Promise<void> } })
            .telegram.sendMessage(config.telegram.adminTelegramId, message, { parse_mode: 'HTML' });
        } catch (sendErr) {
          logger.error(`[BALANCE] Failed to send low balance notification: ${sendErr instanceof Error ? sendErr.message : 'unknown'}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[BALANCE] Balance check failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
