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

export async function mintCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const username = ctx.from?.username;
  getOrCreateUser(telegramId, username);

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const url = parts[1];

  if (!url) {
    await ctx.reply(
      '\u274c <b>Usage:</b> /mint &lt;opensea_url&gt;\n\n' +
      '<b>Examples:</b>\n' +
      '\u2022 /mint https://opensea.io/collection/azuki\n' +
      '\u2022 /mint https://opensea.io/assets/ethereum/0x1234.../1',
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

  const userSettings = getUserSettings(telegramId, {
    max_mint_price_eth: config.mint.defaultMaxMintPriceEth,
    max_gas_eth: config.mint.defaultMaxGasEth,
    quantity: config.mint.defaultQuantity,
  });

  // Single source of truth for jobId — created here, passed to engine
  const jobId = uuidv4();
  createJob({ id: jobId, telegram_id: telegramId });

  logAction(telegramId, 'MINT_QUEUED', { jobId, url });
  logger.info(`[MINT_CMD] User ${telegramId} queued mint job ${jobId} for ${url}`);

  await ctx.reply(
    mintStarted({
      collectionName: 'Resolving...',
      contractAddress: 'Pending',
      quantity: userSettings.quantity,
      mintPriceEth: 'Pending',
      maxGasEth: userSettings.max_gas_eth,
      walletAddress: '0x0000000000000000000000000000000000000000',
      jobId,
    }),
    { parse_mode: 'HTML' }
  );

  await addMintJob({ telegramId, url, jobId }, jobId);
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
