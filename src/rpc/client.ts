import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';

const primaryTransport = http(config.rpc.primaryRpcUrl, {
  retryCount: 2,
  retryDelay: 1000,
});

const backupTransport = http(config.rpc.backupRpcUrl, {
  retryCount: 2,
  retryDelay: 1000,
});

export const publicClient: PublicClient = createPublicClient({
  chain: mainnet,
  transport: fallback([primaryTransport, backupTransport], {
    rank: false,
  }),
});

export async function getLatestBaseFee(): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  if (!block.baseFeePerGas) {
    throw new Error('Could not retrieve baseFeePerGas from latest block');
  }
  return block.baseFeePerGas;
}

export async function getMaxPriorityFeePerGas(): Promise<bigint> {
  try {
    const feeHistory = await publicClient.getFeeHistory({
      blockCount: 4,
      rewardPercentiles: [25, 50, 75],
    });

    // Use median of the 50th percentile rewards from last 4 blocks
    const rewards = feeHistory.reward?.map(r => r[1]).filter((v): v is bigint => v !== undefined) || [];
    if (rewards.length === 0) {
      throw new Error('No priority fee data available');
    }

    // Calculate median
    const sorted = [...rewards].sort((a, b) => (a < b ? -1 : 1));
    const median = sorted[Math.floor(sorted.length / 2)];

    if (!median) {
      throw new Error('Could not calculate median priority fee');
    }

    logger.info(`[GAS] Network priority fee (median): ${Number(median) / 1e9} gwei`);
    return median;
  } catch (error) {
    logger.warn('[GAS] Failed to fetch network priority fee, using fallback');
    throw error;
  }
}

export async function getEthBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.getBalance({ address });
}
