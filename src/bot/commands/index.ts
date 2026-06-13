import type { Telegraf, Context } from 'telegraf';
import { startCommand, helpCommand } from './start';
import { mintCommand, mintMaxCommand, statusCommand, historyCommand, cancelCommand } from './mint';
import { dryRunCommand, executeDryRun } from './dryrun';
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
import { config } from '../../config';

/**
 * When DRY_RUN_MODE is enabled, intercept mint commands and run a simulation
 * instead of a real mint. No transaction is ever sent in this mode.
 */
function dryRunGate(
  handler: (ctx: Context) => Promise<void>
): (ctx: Context) => Promise<void> {
  return async (ctx: Context): Promise<void> => {
    if (!config.mint.dryRunMode) {
      return handler(ctx);
    }
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const url = text.trim().split(/\s+/)[1];
    if (!url) {
      return handler(ctx); // let the original command show its usage message
    }
    await ctx.reply(
      '\u26a0\ufe0f <b>DRY_RUN_MODE is active.</b> Running a simulation instead of a real mint. No transaction will be sent.',
      { parse_mode: 'HTML' }
    );
    await executeDryRun(ctx, url);
  };
}

export function registerCommands(bot: Telegraf<Context>): void {
  bot.command('start', startCommand);
  bot.command('help', helpCommand);

  bot.command('mint', rateLimitMint(), dryRunGate(mintCommand));
  bot.command('mint_max', rateLimitMint(), dryRunGate(mintMaxCommand));
  bot.command('dryrun', rateLimitMint(), dryRunCommand);
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
