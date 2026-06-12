import type { Telegraf, Context } from 'telegraf';
import { startCommand, helpCommand } from './start';
import { mintCommand, statusCommand, historyCommand, cancelCommand } from './mint';
import { walletsCommand } from './wallet';
import { settingsCommand, setMaxPriceCommand, setMaxGasCommand, setQuantityCommand } from './settings';
import {
  adminStatsCommand,
  adminReloadCommand,
  adminBlacklistCommand,
  blacklistCommand,
  whitelistCommand,
} from './admin';
import { adminOnly } from '../middleware/auth';
import { rateLimitMint } from '../middleware/rateLimit';

export function registerCommands(bot: Telegraf<Context>): void {
  bot.command('start', startCommand);
  bot.command('help', helpCommand);

  bot.command('mint', rateLimitMint(), mintCommand);
  bot.command('status', statusCommand);
  bot.command('history', historyCommand);
  bot.command('cancel', cancelCommand);

  bot.command('wallets', walletsCommand);

  bot.command('settings', settingsCommand);
  bot.command('set_maxprice', setMaxPriceCommand);
  bot.command('set_maxgas', setMaxGasCommand);
  bot.command('set_quantity', setQuantityCommand);

  bot.command('blacklist', adminOnly(), blacklistCommand);
  bot.command('whitelist', adminOnly(), whitelistCommand);
  bot.command('admin_stats', adminOnly(), adminStatsCommand);
  bot.command('admin_reload', adminOnly(), adminReloadCommand);
  bot.command('admin_blacklist', adminOnly(), adminBlacklistCommand);
}
