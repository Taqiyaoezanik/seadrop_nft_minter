import type { Context } from 'telegraf';
import { walletPool } from '../../wallet/pool';

export async function walletsCommand(ctx: Context): Promise<void> {
  const wallets = walletPool.getPoolStatus();

  if (wallets.length === 0) {
    await ctx.reply('⚠️ No wallets configured. Add WALLET_1_KEY to your .env file.');
    return;
  }

  const idle = wallets.filter((w) => w.status === 'IDLE').length;
  const busy = wallets.filter((w) => w.status === 'BUSY').length;

  // Batch wallets into groups of 20 per message to avoid Telegram character limit
  const WALLETS_PER_MESSAGE = 20;
  const totalMessages = Math.ceil(wallets.length / WALLETS_PER_MESSAGE);

  // Send first message with summary
  const summary = `<b>💰 Wallet Pool (${wallets.length} total | ${idle} idle | ${busy} busy)</b>\n\n<i>Showing wallets in pages below...</i>`;
  await ctx.reply(summary, { parse_mode: 'HTML' });

  // Send wallet pages
  for (let page = 0; page < totalMessages; page++) {
    const start = page * WALLETS_PER_MESSAGE;
    const end = Math.min(start + WALLETS_PER_MESSAGE, wallets.length);
    const pageWallets = wallets.slice(start, end);

    const lines = pageWallets.map((w, i) => {
      const walletNumber = start + i + 1;
      const statusEmoji = w.status === 'IDLE' ? '🟢' : '🔴';
      const balanceNum = parseFloat(w.balanceEth);
      const balanceDisplay = balanceNum.toFixed(6);
      return (
        `${statusEmoji} <b>Wallet ${walletNumber}</b>\n` +
        `   Address: <code>${w.address}</code>\n` +
        `   Balance: <b>${balanceDisplay} ETH</b>\n` +
        `   Status: <b>${w.status}</b>`
      );
    });

    const pageMessage = `<b>📄 Page ${page + 1} of ${totalMessages}</b>\n\n${lines.join('\n\n')}`;
    await ctx.reply(pageMessage, { parse_mode: 'HTML' });
  }
}
