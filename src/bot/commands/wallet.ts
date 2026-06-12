import type { Context } from 'telegraf';
import { walletPool } from '../../wallet/pool';
import { checkBalances } from '../../wallet/balanceChecker';

export async function walletsCommand(ctx: Context): Promise<void> {
  await checkBalances();
  const wallets = walletPool.getPoolStatus();

  if (wallets.length === 0) {
    await ctx.reply('\u26a0\ufe0f No wallets configured. Add WALLET_1_KEY to your .env file.');
    return;
  }

  const lines = wallets.map((w, i) => {
    const statusEmoji = w.status === 'IDLE' ? '\ud83d\udfe2' : '\ud83d\udd34';
    const balanceNum = parseFloat(w.balanceEth);
    const balanceDisplay = balanceNum.toFixed(6);
    return (
      `${statusEmoji} <b>Wallet ${i + 1}</b>\n` +
      `   Address: <code>${w.address}</code>\n` +
      `   Balance: <b>${balanceDisplay} ETH</b>\n` +
      `   Status: <b>${w.status}</b>`
    );
  });

  const idle = wallets.filter((w) => w.status === 'IDLE').length;
  const busy = wallets.filter((w) => w.status === 'BUSY').length;

  await ctx.reply(
    `<b>\ud83d\udcb0 Wallet Pool (${wallets.length} total | ${idle} idle | ${busy} busy)</b>\n\n` +
    lines.join('\n\n'),
    { parse_mode: 'HTML' }
  );
}
