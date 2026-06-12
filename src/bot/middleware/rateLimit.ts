import type { Context, MiddlewareFn } from 'telegraf';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const userWindows = new Map<string, number[]>();

export function rateLimitMint(): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return next();

    const now = Date.now();
    const windowMs = config.rateLimit.windowMs;
    const max = config.rateLimit.max;

    const timestamps = (userWindows.get(telegramId) ?? []).filter(
      (t) => now - t < windowMs
    );

    if (timestamps.length >= max) {
      const oldestTimestamp = timestamps[0] ?? now;
      const resetIn = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
      logger.warn(`[RATE_LIMIT] User ${telegramId} rate limited`);
      await ctx.reply(
        `\u23f3 <b>Rate limit reached.</b>\n\nYou can send up to ${max} mint requests per ${windowMs / 1000}s.\nTry again in <b>${resetIn > 0 ? resetIn : 1}s</b>.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    timestamps.push(now);
    userWindows.set(telegramId, timestamps);
    return next();
  };
}
