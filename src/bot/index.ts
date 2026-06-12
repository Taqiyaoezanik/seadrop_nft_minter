import { Telegraf } from 'telegraf';
import { config } from '../config';
import { logger } from '../utils/logger';
import { registerCommands } from './commands/index';

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegram.botToken);

  // Global error handler
  bot.catch((err, ctx) => {
    logger.error(`[BOT] Unhandled error for update ${ctx.updateType}: ${err instanceof Error ? err.message : 'unknown'}`);
  });

  registerCommands(bot);

  logger.info('[BOT] Bot initialized');
  return bot;
}
