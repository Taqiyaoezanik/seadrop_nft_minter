import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  ADMIN_TELEGRAM_ID: z.string().min(1, 'ADMIN_TELEGRAM_ID is required'),

  // RPC
  ALCHEMY_API_KEY: z.string().min(1, 'ALCHEMY_API_KEY is required'),
  BACKUP_RPC_URL: z.string().url().default('https://cloudflare-eth.com'),

  // OpenSea
  OPENSEA_API_KEY: z.string().min(1, 'OPENSEA_API_KEY is required'),

  // Etherscan
  ETHERSCAN_API_KEY: z.string().min(1, 'ETHERSCAN_API_KEY is required'),

  // Mint defaults
  DEFAULT_MAX_MINT_PRICE_ETH: z.string().default('0.1'),
  DEFAULT_MAX_GAS_ETH: z.string().default('0.02'),
  DEFAULT_QUANTITY: z.string().default('1'),
  LOW_BALANCE_THRESHOLD_ETH: z.string().default('0.05'),
  MAX_PRIORITY_FEE_GWEI: z.string().default('0.1'),
  TX_TIMEOUT_SECONDS: z.string().default('300'),
  QUEUE_CONCURRENCY: z.string().default('10'),

  // Multi-wallet mint concurrency (how many wallets mint in parallel)
  MULTI_WALLET_CONCURRENCY: z.string().default('5'),
  MULTI_WALLET_PROGRESS_INTERVAL: z.string().default('10'),

  // Rate limiting
  RATE_LIMIT_MAX: z.string().default('5'),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),

  // GoPlus
  GOPLUS_STRICT_MODE: z.string().default('false'),

  // Dry run — when true, every /mint command runs as a simulation
  DRY_RUN_MODE: z.string().default('false'),

});

function loadWalletKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const key = process.env[`WALLET_${i}_KEY`];
    if (key && key.trim().length > 0) {
      keys.push(key.trim());
    }
  }
  return keys;
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[CONFIG] Invalid environment variables:');
  parsed.error.errors.forEach((err) => {
    console.error(`  - ${err.path.join('.')}: ${err.message}`);
  });
  process.exit(1);
}

const env = parsed.data;

export const config = {
  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    adminTelegramId: env.ADMIN_TELEGRAM_ID,
  },
  rpc: {
    alchemyApiKey: env.ALCHEMY_API_KEY,
    primaryRpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    backupRpcUrl: env.BACKUP_RPC_URL,
  },
  opensea: {
    apiKey: env.OPENSEA_API_KEY,
    baseUrl: 'https://api.opensea.io',
  },
  etherscan: {
    apiKey: env.ETHERSCAN_API_KEY,
    baseUrl: 'https://api.etherscan.io',
  },
  mint: {
    defaultMaxMintPriceEth: env.DEFAULT_MAX_MINT_PRICE_ETH,
    defaultMaxGasEth: env.DEFAULT_MAX_GAS_ETH,
    defaultQuantity: parseInt(env.DEFAULT_QUANTITY, 10),
    lowBalanceThresholdEth: env.LOW_BALANCE_THRESHOLD_ETH,
    maxPriorityFeeGwei: parseFloat(env.MAX_PRIORITY_FEE_GWEI),
    txTimeoutSeconds: parseInt(env.TX_TIMEOUT_SECONDS, 10),
    queueConcurrency: parseInt(env.QUEUE_CONCURRENCY, 10),
    dryRunMode: env.DRY_RUN_MODE === 'true',
    multiWalletConcurrency: parseInt(env.MULTI_WALLET_CONCURRENCY, 10),
    multiWalletProgressInterval: parseInt(env.MULTI_WALLET_PROGRESS_INTERVAL, 10),
  },
  rateLimit: {
    max: parseInt(env.RATE_LIMIT_MAX, 10),
    windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS, 10),
  },
  goplus: {
    strictMode: env.GOPLUS_STRICT_MODE === 'true',
    baseUrl: 'https://api.gopluslabs.io',
  },
  walletKeys: loadWalletKeys(),
} as const;

export type Config = typeof config;
