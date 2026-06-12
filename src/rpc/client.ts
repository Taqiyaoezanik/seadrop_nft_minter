import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';

const REQUEST_DELAY_MS = 50;

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

const primaryTransport = http(config.rpc.primaryRpcUrl, {
  retryCount: 2,
  retryDelay: 1000,
  fetchOptions: {},
});

const backupTransport = http(config.rpc.backupRpcUrl, {
  retryCount: 2,
  retryDelay: 1000,
});

export const publicClient: PublicClient = createPublicClient({
  chain: mainnet,
  transport: fallback([primaryTransport, backupTransport]),
});

export async function getLatestBaseFee(): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  if (!block.baseFeePerGas) {
    throw new Error('Could not retrieve baseFeePerGas from latest block');
  }
  return block.baseFeePerGas;
}

export async function getEthBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.getBalance({ address });
}

export { throttle };
