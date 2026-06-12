import { config } from '../../config';
import type { Context, MiddlewareFn } from 'telegraf';

export function adminOnly(): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (telegramId !== config.telegram.adminTelegramId) {
      await ctx.reply('\u26d4 This command is restricted to the bot administrator.');
      return;
    }
    return next();
  };
}
