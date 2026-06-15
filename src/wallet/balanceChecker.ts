import { walletPool } from './pool';
import { config } from '../config';
import { logger } from '../utils/logger';
import { notifyLowBalance } from '../notifications/templates';
import type { Telegraf, Context } from 'telegraf';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const CHECK_COOLDOWN_MS = 60 * 1000; // 1 menit cooldown

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let botInstance: Telegraf<Context> | null = null;
let lastCheckTime = 0;

export function startBalanceChecker(bot: Telegraf<Context>): void {
  botInstance = bot;
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    checkBalances().catch((err) => {
      logger.error(`[BALANCE] Interval check error: ${err instanceof Error ? err.message : 'unknown'}`);
    });
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
  const now = Date.now();
  if (now - lastCheckTime < CHECK_COOLDOWN_MS) {
    logger.info('[BALANCE] Check skipped (cooldown active)');
    return;
  }
  
  lastCheckTime = now;

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
          await botInstance.telegram.sendMessage(
            config.telegram.adminTelegramId,
            message,
            { parse_mode: 'HTML' }
          );
        } catch (sendErr) {
          logger.error(`[BALANCE] Failed to send low balance notification: ${sendErr instanceof Error ? sendErr.message : 'unknown'}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[BALANCE] Balance check failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
