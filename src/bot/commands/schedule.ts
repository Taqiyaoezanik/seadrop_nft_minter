import type { Context } from 'telegraf';
import { v4 as uuidv4 } from 'uuid';
import { getOrCreateUser } from '../../db/users';
import { createScheduledMint, getUserScheduledMints, cancelScheduledMint } from '../../db/scheduledMints';
import { parseOpenSeaUrl } from '../../mint/urlParser';
import { logger } from '../../utils/logger';
import { logAction } from '../../db/auditLogs';

/**
 * Parse time input: supports "22:00", "10:00 PM", "2024-06-13 22:00"
 */
function parseScheduledTime(timeStr: string): Date | null {
  try {
    const now = new Date();

    // Format: HH:MM (24-hour)
    const time24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (time24Match && time24Match[1] && time24Match[2]) {
      const hours = time24Match[1];
      const minutes = time24Match[2];
      const scheduled = new Date(now);
      scheduled.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      // If time has passed today, schedule for tomorrow
      if (scheduled <= now) {
        scheduled.setDate(scheduled.getDate() + 1);
      }

      return scheduled;
    }

    // Format: HH:MM AM/PM (12-hour)
    const time12Match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (time12Match && time12Match[1] && time12Match[2] && time12Match[3]) {
      const hours = time12Match[1];
      const minutes = time12Match[2];
      const period = time12Match[3];
      let hour = parseInt(hours, 10);

      if (period.toUpperCase() === 'PM' && hour !== 12) {
        hour += 12;
      } else if (period.toUpperCase() === 'AM' && hour === 12) {
        hour = 0;
      }

      const scheduled = new Date(now);
      scheduled.setHours(hour, parseInt(minutes, 10), 0, 0);

      if (scheduled <= now) {
        scheduled.setDate(scheduled.getDate() + 1);
      }

      return scheduled;
    }

    // Format: YYYY-MM-DD HH:MM or ISO string
    const fullDate = new Date(timeStr);
    if (!isNaN(fullDate.getTime())) {
      return fullDate;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse command text respecting quoted strings
 */
function parseCommandArgs(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"' || char === '"' || char === '"') { // Handle smart quotes from mobile
      inQuotes = !inQuotes;
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * /schedule_mint <url> <time> [wallet_from] [wallet_to]
 */
export async function scheduleMintCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const username = ctx.from?.username;
  getOrCreateUser(telegramId, username);

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = parseCommandArgs(text.trim());

  if (parts.length < 3) {
    await ctx.reply(
      '❌ <b>Usage:</b> /schedule_mint &lt;opensea_url&gt; &lt;time&gt; [wallet_from] [wallet_to]\n\n' +
      '<b>Time formats:</b>\n' +
      '• 22:00 (24-hour)\n' +
      '• 10:00 PM (12-hour)\n' +
      '• 2024-06-13 22:00 (full date)\n\n' +
      '<b>Examples:</b>\n' +
      '• /schedule_mint https://opensea.io/collection/azuki 22:00\n' +
      '• /schedule_mint https://opensea.io/collection/azuki 10:00 PM 1 5\n' +
      '• /schedule_mint https://opensea.io/collection/azuki "2024-06-13 22:00"',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const url = parts[1];
  const timeStr = parts[2];
  const walletFrom = parts[3] ? parseInt(parts[3], 10) : undefined;
  const walletTo = parts[4] ? parseInt(parts[4], 10) : undefined;

  // Validate URL
  if (!url) {
    await ctx.reply('❌ <b>Missing URL parameter</b>', { parse_mode: 'HTML' });
    return;
  }

  try {
    parseOpenSeaUrl(url);
  } catch (err) {
    await ctx.reply(
      `❌ <b>Invalid URL:</b> ${err instanceof Error ? err.message : 'Unknown error'}`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Parse time
  if (!timeStr) {
    await ctx.reply('❌ <b>Missing time parameter</b>', { parse_mode: 'HTML' });
    return;
  }

  const scheduledTime = parseScheduledTime(timeStr);
  if (!scheduledTime) {
    await ctx.reply(
      '❌ <b>Invalid time format.</b>\n\n' +
      'Supported formats:\n' +
      '• 22:00 (24-hour)\n' +
      '• 10:00 PM (12-hour)\n' +
      '• 2024-06-13 22:00',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Check if time is in the future
  if (scheduledTime <= new Date()) {
    await ctx.reply('❌ <b>Scheduled time must be in the future</b>', { parse_mode: 'HTML' });
    return;
  }

  // Validate wallet range if provided
  if (walletFrom !== undefined) {
    if (isNaN(walletFrom) || walletFrom < 1) {
      await ctx.reply('❌ <b>Invalid wallet_from. Must be ≥ 1</b>', { parse_mode: 'HTML' });
      return;
    }

    if (walletTo !== undefined && (isNaN(walletTo) || walletTo < walletFrom)) {
      await ctx.reply('❌ <b>Invalid wallet_to. Must be ≥ wallet_from</b>', { parse_mode: 'HTML' });
      return;
    }
  }

  const scheduleId = uuidv4();

  try {
    createScheduledMint({
      id: scheduleId,
      telegram_id: telegramId,
      url: url, // Already validated as non-undefined above
      scheduled_time: scheduledTime.toISOString(),
      wallet_from: walletFrom,
      wallet_to: walletTo,
    });

    logAction(telegramId, 'SCHEDULE_MINT_CREATED', { scheduleId, url, scheduledTime: scheduledTime.toISOString() });

    const walletInfo = walletFrom
      ? walletTo
        ? ` (wallets ${walletFrom}-${walletTo})`
        : ` (wallet ${walletFrom})`
      : '';

    await ctx.reply(
      `✅ <b>Mint scheduled!</b>\n\n` +
      `⏰ Time: ${scheduledTime.toLocaleString()}\n` +
      `🔗 URL: ${url}\n` +
      `${walletInfo}\n\n` +
      `ID: <code>${scheduleId}</code>\n\n` +
      `Use /list_schedules to see all scheduled mints\n` +
      `Use /cancel_schedule &lt;id&gt; to cancel`,
      { parse_mode: 'HTML' }
    );

    logger.info(`[SCHEDULE] User ${telegramId} scheduled mint ${scheduleId} for ${scheduledTime.toISOString()}`);
  } catch (error) {
    logger.error(`[SCHEDULE] Failed to create scheduled mint: ${error instanceof Error ? error.message : 'unknown'}`);
    await ctx.reply('❌ <b>Failed to schedule mint. Please try again.</b>', { parse_mode: 'HTML' });
  }
}

/**
 * /list_schedules
 */
export async function listSchedulesCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  getOrCreateUser(telegramId);

  try {
    const schedules = getUserScheduledMints(telegramId);

    if (schedules.length === 0) {
      await ctx.reply('📭 <b>No scheduled mints</b>\n\nUse /schedule_mint to schedule one.', { parse_mode: 'HTML' });
      return;
    }

    const lines: string[] = ['📅 <b>Your Scheduled Mints</b>\n'];

    for (const schedule of schedules) {
      const scheduledTime = new Date(schedule.scheduled_time);
      const status = schedule.status === 'PENDING' ? '⏳ Pending' :
                     schedule.status === 'EXECUTED' ? '✅ Executed' :
                     schedule.status === 'CANCELLED' ? '❌ Cancelled' :
                     '⚠️ Failed';

      const walletInfo = schedule.wallet_from
        ? schedule.wallet_to
          ? ` | Wallets ${schedule.wallet_from}-${schedule.wallet_to}`
          : ` | Wallet ${schedule.wallet_from}`
        : '';

      lines.push(
        `${status}\n` +
        `⏰ ${scheduledTime.toLocaleString()}\n` +
        `🔗 ${schedule.url.slice(0, 50)}...\n` +
        `ID: <code>${schedule.id}</code>${walletInfo}\n`
      );
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  } catch (error) {
    logger.error(`[SCHEDULE] Failed to list schedules: ${error instanceof Error ? error.message : 'unknown'}`);
    await ctx.reply('❌ <b>Failed to fetch schedules</b>', { parse_mode: 'HTML' });
  }
}

/**
 * /cancel_schedule <id>
 */
export async function cancelScheduleCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  getOrCreateUser(telegramId);

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);

  if (parts.length < 2) {
    await ctx.reply(
      '❌ <b>Usage:</b> /cancel_schedule &lt;schedule_id&gt;\n\n' +
      'Get the schedule ID from /list_schedules',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const scheduleId = parts[1];

  if (!scheduleId) {
    await ctx.reply('❌ <b>Missing schedule ID</b>', { parse_mode: 'HTML' });
    return;
  }

  try {
    const success = cancelScheduledMint(scheduleId);

    if (success) {
      logAction(telegramId, 'SCHEDULE_MINT_CANCELLED', { scheduleId });
      await ctx.reply(`✅ <b>Schedule cancelled</b>\n\nID: <code>${scheduleId}</code>`, { parse_mode: 'HTML' });
      logger.info(`[SCHEDULE] User ${telegramId} cancelled schedule ${scheduleId}`);
    } else {
      await ctx.reply(
        '❌ <b>Could not cancel schedule</b>\n\n' +
        'Schedule not found, already executed, or already cancelled.',
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    logger.error(`[SCHEDULE] Failed to cancel schedule: ${error instanceof Error ? error.message : 'unknown'}`);
    await ctx.reply('❌ <b>Failed to cancel schedule</b>', { parse_mode: 'HTML' });
  }
}
