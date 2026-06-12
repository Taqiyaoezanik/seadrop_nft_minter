import 'dotenv/config';
import { createBot } from './bot/index';
import { walletPool } from './wallet/pool';
import { startBalanceChecker } from './wallet/balanceChecker';
import { initWorker } from './queue/mintWorker';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  logger.info('[MAIN] Starting SeaDrop Mint Bot...');

  // Init wallet pool
  walletPool.init();
  const walletCount = walletPool.getWalletCount();
  if (walletCount === 0) {
    logger.error('[MAIN] No wallets loaded. Add at least WALLET_1_KEY to .env');
    process.exit(1);
  }
  logger.info(`[MAIN] Loaded ${walletCount} wallet(s)`);

  // Create bot
  const bot = createBot();

  // Init queue worker
  await initWorker(bot);

  // Start balance checker
  startBalanceChecker(bot as never);

  // Graceful shutdown
  process.once('SIGINT', () => {
    logger.info('[MAIN] SIGINT received, shutting down...');
    bot.stop('SIGINT');
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    logger.info('[MAIN] SIGTERM received, shutting down...');
    bot.stop('SIGTERM');
    process.exit(0);
  });

  // Launch bot
  await bot.launch();
  logger.info('[MAIN] Bot is running and polling for updates');
}

main().catch((err) => {
  logger.error(`[MAIN] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
