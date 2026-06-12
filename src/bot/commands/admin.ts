import type { Context } from 'telegraf';
import { walletPool } from '../../wallet/pool';
import { getAdminStats } from '../../db/mintJobs';
import { getAllBlacklisted, addToBlacklist, removeFromBlacklist } from '../../db/blacklist';
import { logAction } from '../../db/auditLogs';
import { logger } from '../../utils/logger';

export async function adminStatsCommand(ctx: Context): Promise<void> {
  const stats = getAdminStats();
  const pool = walletPool.getPoolStatus();
  const totalBalanceEth = pool
    .reduce((sum, w) => sum + parseFloat(w.balanceEth), 0)
    .toFixed(6);

  await ctx.reply(
    `<b>\ud83d\udcca Admin Stats</b>\n\n` +
    `Total Jobs: <b>${stats.total}</b>\n` +
    `Confirmed: <b>${stats.confirmed}</b>\n` +
    `Failed: <b>${stats.failed}</b>\n` +
    `Dropped: <b>${stats.dropped}</b>\n` +
    `Success Rate: <b>${stats.successRate}</b>\n\n` +
    `Wallets: <b>${pool.length}</b>\n` +
    `Total Balance: <b>${totalBalanceEth} ETH</b>`,
    { parse_mode: 'HTML' }
  );
}

export async function adminReloadCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  try {
    walletPool.reloadFromEnv();
    logAction(telegramId, 'ADMIN_RELOAD', {});
    logger.info(`[ADMIN] Wallet pool reloaded by ${telegramId}`);
    await ctx.reply(`\u2705 Wallet pool reloaded. <b>${walletPool.getWalletCount()}</b> wallet(s) loaded.`, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply(`\u274c Reload failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

export async function adminBlacklistCommand(ctx: Context): Promise<void> {
  const entries = getAllBlacklisted();
  if (entries.length === 0) {
    await ctx.reply('\u2139\ufe0f Blacklist is empty.');
    return;
  }

  const lines = entries.map((e) =>
    `\u2022 <code>${e.contract_address}</code>\n   Reason: ${e.reason ?? 'N/A'}\n   Added by: ${e.added_by ?? 'N/A'}`
  );

  await ctx.reply(
    `<b>\ud83d\udeab Blacklist (${entries.length})</b>\n\n${lines.join('\n\n')}`,
    { parse_mode: 'HTML' }
  );
}

export async function blacklistCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const contract = parts[1]?.toLowerCase();

  if (!contract || !contract.startsWith('0x') || contract.length !== 42) {
    await ctx.reply('\u274c Usage: /blacklist &lt;contract_address&gt;', { parse_mode: 'HTML' });
    return;
  }

  addToBlacklist(contract, 'Manually blacklisted', telegramId);
  logAction(telegramId, 'BLACKLIST_ADD', { contract });
  await ctx.reply(`\u2705 Contract <code>${contract}</code> added to blacklist.`, { parse_mode: 'HTML' });
}

export async function whitelistCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const contract = parts[1]?.toLowerCase();

  if (!contract || !contract.startsWith('0x') || contract.length !== 42) {
    await ctx.reply('\u274c Usage: /whitelist &lt;contract_address&gt;', { parse_mode: 'HTML' });
    return;
  }

  const removed = removeFromBlacklist(contract);
  logAction(telegramId, 'BLACKLIST_REMOVE', { contract });

  if (removed) {
    await ctx.reply(`\u2705 Contract <code>${contract}</code> removed from blacklist.`, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(`\u2139\ufe0f Contract <code>${contract}</code> was not in the blacklist.`, { parse_mode: 'HTML' });
  }
}
