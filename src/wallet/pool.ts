import { privateKeyToAccount } from 'viem/accounts';
import { getEthBalance } from '../rpc/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { parseEther, formatEther, type Address } from 'viem';

export type WalletStatus = 'IDLE' | 'BUSY';

export interface WalletInfo {
  address: Address;
  status: WalletStatus;
  balanceEth: string;
}

interface WalletEntry {
  address: Address;
  privateKey: `0x${string}`;
  status: WalletStatus;
  balanceWei: bigint;
}

class WalletPool {
  private wallets: Map<Address, WalletEntry> = new Map();
  private initialized = false;

  public init(): void {
    if (this.initialized) return;

    const keys = config.walletKeys;
    if (keys.length === 0) {
      logger.warn('[WALLET] No wallet keys found in config. At least WALLET_1_KEY is required.');
      return;
    }

    for (const rawKey of keys) {
      try {
        const privateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
        const account = privateKeyToAccount(privateKey);
        this.wallets.set(account.address, {
          address: account.address,
          privateKey,
          status: 'IDLE',
          balanceWei: 0n,
        });
      } catch (err) {
        logger.error(`[WALLET] Failed to load wallet key: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    logger.info(`[WALLET] Pool initialized with ${this.wallets.size} wallet(s)`);
    this.initialized = true;
  }

  public acquireWallet(): WalletEntry | null {
    for (const [, wallet] of this.wallets) {
      if (wallet.status === 'IDLE') {
        wallet.status = 'BUSY';
        logger.info(`[WALLET] Acquired wallet ${wallet.address.slice(0, 8)}...`);
        return wallet;
      }
    }
    logger.warn('[WALLET] No idle wallets available in pool');
    return null;
  }

  public releaseWallet(address: Address): void {
    const wallet = this.wallets.get(address);
    if (wallet) {
      wallet.status = 'IDLE';
      logger.info(`[WALLET] Released wallet ${address.slice(0, 8)}...`);
    }
  }

  public getPoolStatus(): WalletInfo[] {
    return Array.from(this.wallets.values()).map((w) => ({
      address: w.address,
      status: w.status,
      balanceEth: formatEther(w.balanceWei),
    }));
  }

  public getWalletCount(): number {
    return this.wallets.size;
  }

  public getIdleCount(): number {
    return Array.from(this.wallets.values()).filter((w) => w.status === 'IDLE').length;
  }

  public async updateBalances(): Promise<void> {
    for (const [, wallet] of this.wallets) {
      try {
        wallet.balanceWei = await getEthBalance(wallet.address);
      } catch (err) {
        logger.error(`[WALLET] Failed to fetch balance for ${wallet.address.slice(0, 8)}...: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  }

  public getLowBalanceWallets(thresholdEth: string): WalletInfo[] {
    const threshold = parseEther(thresholdEth);
    return Array.from(this.wallets.values())
      .filter((w) => w.balanceWei < threshold)
      .map((w) => ({
        address: w.address,
        status: w.status,
        balanceEth: formatEther(w.balanceWei),
      }));
  }

  public reloadFromEnv(): void {
    this.wallets.clear();
    this.initialized = false;
    this.init();
  }

  public getPrivateKey(address: Address): `0x${string}` | null {
    return this.wallets.get(address)?.privateKey ?? null;
  }
}

export const walletPool = new WalletPool();
