import type { Context } from 'telegraf';
import { walletPool } from '../../wallet/pool';
import { getOrCreateUser } from '../../db/users';
import { config } from '../../config';

export async function startCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString() ?? '';
  const username = ctx.from?.username;
  getOrCreateUser(telegramId, username);

  const poolStatus = walletPool.getPoolStatus();
  const idle = poolStatus.filter((w) => w.status === 'IDLE').length;
  const busy = poolStatus.filter((w) => w.status === 'BUSY').length;
  const total = poolStatus.length;

  await ctx.reply(
    `\ud83e\udd16 <b>SeaDrop Mint Bot</b>\n\n` +
    `Automated NFT minting bot for OpenSea SeaDrop collections on Ethereum mainnet.\n\n` +
    `<b>\ud83d\udcb0 Wallet Pool</b>\n` +
    `Total: ${total} | Idle: ${idle} | Busy: ${busy}\n\n` +
    `<b>\ud83d\udee0 Quick Commands</b>\n` +
    `/mint &lt;opensea_url&gt; \u2014 Start a mint job\n` +
    `/mint_max &lt;opensea_url&gt; \u2014 Mint max quantity\n` +
    `/wallets \u2014 View wallet pool\n` +
    `/settings \u2014 View your settings\n` +
    `/help \u2014 All commands\n\n` +
    `<i>\u26a0\ufe0f Use burner wallets only. Never use wallets with significant funds.</i>`,
    { parse_mode: 'HTML' }
  );
}

export async function helpCommand(ctx: Context): Promise<void> {
  await ctx.reply(
    `<b>\ud83d\udcd6 Available Commands</b>\n\n` +
    `<b>Minting</b>\n` +
    `/mint &lt;url&gt; \u2014 Mint from OpenSea collection URL\n` +
    `/mint_max &lt;url&gt; \u2014 Mint maximum allowed quantity\n` +
    `/status \u2014 Show active mint jobs\n` +
    `/history \u2014 Last 20 mint transactions\n` +
    `/cancel &lt;job_id&gt; \u2014 Cancel a pending job\n\n` +
    `<b>Wallets</b>\n` +
    `/wallets \u2014 Show wallet pool status\n\n` +
    `<b>Settings</b>\n` +
    `/settings \u2014 Show current settings\n` +
    `/set_maxprice &lt;eth&gt; \u2014 Set max mint price (e.g. 0.05)\n` +
    `/set_maxgas &lt;eth&gt; \u2014 Set max gas fee (e.g. 0.01)\n` +
    `/set_quantity &lt;n&gt; \u2014 Set mint quantity per job\n\n` +
    `<b>Admin Only</b>\n` +
    `/admin_stats \u2014 Total mints, success rate, gas spent\n` +
    `/admin_reload \u2014 Reload wallet pool from .env\n` +
    `/admin_blacklist \u2014 Show full blacklist\n` +
    `/blacklist &lt;contract&gt; \u2014 Add contract to blacklist\n` +
    `/whitelist &lt;contract&gt; \u2014 Remove from blacklist`,
    { parse_mode: 'HTML' }
  );
}
