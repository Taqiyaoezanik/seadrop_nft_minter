import type { Context } from 'telegraf';
import { getOrCreateUser, getUserSettings, updateUserSettings } from '../../db/users';
import { config } from '../../config';

function getDefaults() {
  return {
    max_mint_price_eth: config.mint.defaultMaxMintPriceEth,
    max_gas_eth: config.mint.defaultMaxGasEth,
    quantity: config.mint.defaultQuantity,
  };
}

export async function settingsCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  getOrCreateUser(telegramId, ctx.from?.username);
  const settings = getUserSettings(telegramId, getDefaults());

  await ctx.reply(
    `<b>\u2699\ufe0f Your Settings</b>\n\n` +
    `Max Mint Price: <b>${settings.max_mint_price_eth} ETH</b>\n` +
    `Max Gas Fee: <b>${settings.max_gas_eth} ETH</b>\n` +
    `Quantity per Job: <b>${settings.quantity}</b>\n\n` +
    `<i>Use /set_maxprice, /set_maxgas, /set_quantity to change.</i>`,
    { parse_mode: 'HTML' }
  );
}

export async function setMaxPriceCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const value = parts[1];

  if (!value || isNaN(parseFloat(value)) || parseFloat(value) <= 0) {
    await ctx.reply('\u274c Usage: /set_maxprice &lt;eth&gt;\nExample: /set_maxprice 0.05', { parse_mode: 'HTML' });
    return;
  }

  getOrCreateUser(telegramId, ctx.from?.username);
  updateUserSettings(telegramId, { max_mint_price_eth: value }, getDefaults());
  await ctx.reply(`\u2705 Max mint price set to <b>${value} ETH</b>`, { parse_mode: 'HTML' });
}

export async function setMaxGasCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const value = parts[1];

  if (!value || isNaN(parseFloat(value)) || parseFloat(value) <= 0) {
    await ctx.reply('\u274c Usage: /set_maxgas &lt;eth&gt;\nExample: /set_maxgas 0.01', { parse_mode: 'HTML' });
    return;
  }

  getOrCreateUser(telegramId, ctx.from?.username);
  updateUserSettings(telegramId, { max_gas_eth: value }, getDefaults());
  await ctx.reply(`\u2705 Max gas fee set to <b>${value} ETH</b>`, { parse_mode: 'HTML' });
}

export async function setQuantityCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const value = parts[1];
  const qty = parseInt(value ?? '', 10);

  if (!value || isNaN(qty) || qty <= 0 || qty > 100) {
    await ctx.reply('\u274c Usage: /set_quantity &lt;n&gt;\nExample: /set_quantity 2\n(Min: 1, Max: 100)', { parse_mode: 'HTML' });
    return;
  }

  getOrCreateUser(telegramId, ctx.from?.username);
  updateUserSettings(telegramId, { quantity: qty }, getDefaults());
  await ctx.reply(`\u2705 Mint quantity set to <b>${qty}</b>`, { parse_mode: 'HTML' });
}
