import type { Context } from 'telegraf';
import { addMintJob } from '../../queue/mintQueue';
import { getOrCreateUser, getUserSettings } from '../../db/users';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { logAction } from '../../db/auditLogs';
import { mintStarted } from '../../notifications/templates';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '../../db/mintJobs';
import { parseOpenSeaUrl } from '../../mint/urlParser';
import type { WalletRange } from '../../mint/engine';
import { walletPool } from '../../wallet/pool';

/**
 * Parse optional wallet range arguments from command parts.
 * Accepts: /mint <url> [from] [to]
 * Returns undefined when no valid range is provided.
 */
function parseWalletRange(
  parts: string[],
  fromIdx: number
): { range: WalletRange | undefined; error: string | undefined } {
  const fromStr = parts[fromIdx];
  const toStr = parts[fromIdx + 1];

  if (!fromStr) return { range: undefined, error: undefined };

  const from = parseInt(fromStr, 10);
  const to = toStr !== undefined ? parseInt(toStr, 10) : from;

  if (isNaN(from) || from < 1) {
    return { range: undefined, error: `Invalid wallet range start: <b>${fromStr}</b>. Must be a positive number.` };
  }
  if (isNaN(to) || to < from) {
    return { range: undefined, error: `Invalid wallet range end: <b>${toStr}</b>. Must be ≥ start (${from}).` };
  }

  const totalWallets = walletPool.getWalletCount();
  if (from > totalWallets) {
    return {
      range: undefined,
      error: `Wallet range start <b>${from}</b> exceeds total wallets in pool (<b>${totalWallets}</b>).`,
    };
  }

  return { range: { from, to: Math.min(to, totalWallets) }, error: undefined };
}

export async function mintMaxCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const username = ctx.from?.username;
  getOrCreateUser(telegramId, username);

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const url = parts[1];

  if (!url) {
    await ctx.reply(
      '\u274c <b>Usage:</b> /mint_max &lt;opensea_url&gt; [wallet_from] [wallet_to]\n\n' +
      '<b>Examples:</b>\n' +
      '\u2022 /mint_max https://opensea.io/collection/azuki\n' +
      '\u2022 /mint_max https://opensea.io/collection/azuki 1 5',
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    parseOpenSeaUrl(url);
  } catch (err) {
    await ctx.reply(
      `\u274c <b>Invalid URL:</b> ${err instanceof Error ? err.message : 'Unknown error'}`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Parse optional wallet range: parts[2] = from, parts[3] = to
  const { range: walletRange, error: rangeError } = parseWalletRange(parts, 2);
  if (rangeError) {
    await ctx.reply(`\u274c ${rangeError}`, { parse_mode: 'HTML' });
    return;
  }

  const userSettings = getUserSettings(telegramId, {
    max_mint_price_eth: config.mint.defaultMaxMintPriceEth,
    max_gas_eth: config.mint.defaultMaxGasEth,
    quantity: config.mint.defaultQuantity,
  });

  const jobId = uuidv4();
  createJob({ id: jobId, telegram_id: telegramId });

  logAction(telegramId, 'MINT_MAX_QUEUED', { jobId, url, walletRange });
  logger.info(
    `[MINT_CMD] User ${telegramId} queued mint_max job ${jobId} for ${url}` +
    (walletRange ? ` (wallets ${walletRange.from}-${walletRange.to})` : '')
  );

  const rangeNote = walletRange
    ? `\n\ud83d\udcbc Wallets: <b>${walletRange.from}–${walletRange.to}</b>`
    : '';

  await ctx.reply(
    mintStarted({
      collectionName: 'Resolving...',
      contractAddress: 'Pending',
      quantity: 0, // will be determined by contract max
      mintPriceEth: 'Pending',
      maxGasEth: userSettings.max_gas_eth,
      walletAddress: '0x0000000000000000000000000000000000000000',
      jobId,
    })
      .replace('Quantity: <b>0</b>', 'Quantity: <b>MAX</b>')
      .replace('</code>\n', `</code>${rangeNote}\n`),
    { parse_mode: 'HTML' }
  );

  await addMintJob({ telegramId, url, jobId, forceMaxQuantity: true, walletRange }, jobId);
}

export async function mintCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const username = ctx.from?.username;
  getOrCreateUser(telegramId, username);

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const url = parts[1];

  if (!url) {
    await ctx.reply(
      '\u274c <b>Usage:</b> /mint &lt;opensea_url&gt; [wallet_from] [wallet_to]\n\n' +
      '<b>Examples:</b>\n' +
      '\u2022 /mint https://opensea.io/collection/azuki\n' +
      '\u2022 /mint https://opensea.io/collection/azuki 1 5\n' +
      '\u2022 /mint https://opensea.io/assets/ethereum/0x1234.../1 3',
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    parseOpenSeaUrl(url);
  } catch (err) {
    await ctx.reply(
      `\u274c <b>Invalid URL:</b> ${err instanceof Error ? err.message : 'Unknown error'}`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Parse optional wallet range: parts[2] = from, parts[3] = to
  const { range: walletRange, error: rangeError } = parseWalletRange(parts, 2);
  if (rangeError) {
    await ctx.reply(`\u274c ${rangeError}`, { parse_mode: 'HTML' });
    return;
  }

  const userSettings = getUserSettings(telegramId, {
    max_mint_price_eth: config.mint.defaultMaxMintPriceEth,
    max_gas_eth: config.mint.defaultMaxGasEth,
    quantity: config.mint.defaultQuantity,
  });

  // Single source of truth for jobId — created here, passed to engine
  const jobId = uuidv4();
  createJob({ id: jobId, telegram_id: telegramId });

  logAction(telegramId, 'MINT_QUEUED', { jobId, url, walletRange });
  logger.info(
    `[MINT_CMD] User ${telegramId} queued mint job ${jobId} for ${url}` +
    (walletRange ? ` (wallets ${walletRange.from}-${walletRange.to})` : '')
  );

  const rangeNote = walletRange
    ? `\n\ud83d\udcbc Wallets: <b>${walletRange.from}–${walletRange.to}</b>`
    : '';

  await ctx.reply(
    mintStarted({
      collectionName: 'Resolving...',
      contractAddress: 'Pending',
      quantity: userSettings.quantity,
      mintPriceEth: 'Pending',
      maxGasEth: userSettings.max_gas_eth,
      walletAddress: '0x0000000000000000000000000000000000000000',
      jobId,
    }).replace('</code>\n', `</code>${rangeNote}\n`),
    { parse_mode: 'HTML' }
  );

  await addMintJob({ telegramId, url, jobId, walletRange }, jobId);
}

export async function statusCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const { getActiveJobs } = await import('../../db/mintJobs');
  const jobs = getActiveJobs(telegramId);

  if (jobs.length === 0) {
    await ctx.reply('\u2139\ufe0f No active mint jobs.');
    return;
  }

  const lines = jobs.map((j) =>
    `\u2022 <code>${j.id.slice(0, 8)}</code> | ${j.status} | ${j.collection_name ?? 'Unknown'}`
  );

  await ctx.reply(
    `<b>\u23f3 Active Mint Jobs (${jobs.length})</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
}

export async function historyCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const { getJobHistory } = await import('../../db/mintJobs');
  const jobs = getJobHistory(telegramId, 20);

  if (jobs.length === 0) {
    await ctx.reply('\u2139\ufe0f No mint history yet.');
    return;
  }

  const statusEmoji: Record<string, string> = {
    CONFIRMED: '\u2705',
    FAILED: '\u274c',
    DROPPED: '\u23f3',
    CANCELLED: '\u26d4',
    PENDING: '\u23f3',
    PROCESSING: '\u23f3',
  };

  const lines = jobs.map((j) => {
    const emoji = statusEmoji[j.status] ?? '\u2022';
    const name = j.collection_name ?? 'Unknown';
    const date = new Date(j.created_at).toLocaleDateString();
    return `${emoji} <b>${name}</b> | ${j.status} | ${date}`;
  });

  await ctx.reply(
    `<b>\ud83d\udcdc Mint History (last ${jobs.length})</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
}

export async function cancelCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const jobId = parts[1];

  if (!jobId) {
    await ctx.reply('\u274c Usage: /cancel &lt;job_id&gt;', { parse_mode: 'HTML' });
    return;
  }

  const { cancelJob, getJob } = await import('../../db/mintJobs');

  const job = getJob(jobId);
  if (!job || job.telegram_id !== telegramId) {
    await ctx.reply('\u274c Job not found or does not belong to you.');
    return;
  }

  if (job.status === 'PROCESSING') {
    await ctx.reply(
      `\u26a0\ufe0f Job <code>${jobId.slice(0, 8)}</code> is currently being processed and cannot be cancelled.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (job.status !== 'PENDING') {
    await ctx.reply(
      `\u274c Job <code>${jobId.slice(0, 8)}</code> has already completed with status: <b>${job.status}</b>.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const cancelled = cancelJob(jobId, telegramId);
  if (cancelled) {
    await ctx.reply(
      `\u2705 Job <code>${jobId.slice(0, 8)}</code> has been cancelled.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('\u274c Failed to cancel job. Please try again.');
  }
}
