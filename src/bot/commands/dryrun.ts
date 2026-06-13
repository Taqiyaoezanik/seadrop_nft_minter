import type { Context } from 'telegraf';
import { runDryRun } from '../../mint/dryRun';
import { getOrCreateUser } from '../../db/users';
import { logAction } from '../../db/auditLogs';
import { logger } from '../../utils/logger';
import { dryRunReport } from '../../notifications/templates';

/**
 * Execute a dry-run for the given URL and reply with the full report.
 * Shared by /dryrun and the DRY_RUN_MODE gate on /mint commands.
 */
export async function executeDryRun(ctx: Context, url: string): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';

  await ctx.reply(
    '\ud83e\uddea <b>Dry-run started</b> \u2014 simulating the full mint pipeline. No transaction will be sent.',
    { parse_mode: 'HTML' }
  );

  try {
    const result = await runDryRun(telegramId, url);
    logAction(telegramId, 'DRY_RUN', { url, ok: result.ok });
    logger.info(`[DRYRUN_CMD] User ${telegramId} dry-run for ${url}: ${result.ok ? 'PASS' : 'FAIL'}`);
    await ctx.reply(dryRunReport(result), { parse_mode: 'HTML' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    logger.error(`[DRYRUN_CMD] Dry-run failed for ${url}: ${message}`);
    await ctx.reply(`\u274c <b>Dry-run failed:</b> ${message}`, { parse_mode: 'HTML' });
  }
}

export async function dryRunCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const username = ctx.from?.username;
  getOrCreateUser(telegramId, username);

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const url = parts[1];

  if (!url) {
    await ctx.reply(
      '\u274c <b>Usage:</b> /dryrun &lt;opensea_url&gt;\n\n' +
      '<b>Example:</b>\n' +
      '\u2022 /dryrun https://opensea.io/collection/azuki',
      { parse_mode: 'HTML' }
    );
    return;
  }

  await executeDryRun(ctx, url);
}
