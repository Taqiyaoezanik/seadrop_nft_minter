import { publicClient } from '../rpc/client';
import { formatEther } from 'viem';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { Address } from 'viem';

export type TxStatus = 'CONFIRMED' | 'FAILED' | 'DROPPED';

export interface TxMonitorResult {
  status: TxStatus;
  tokenIds: string[];
  gasUsedEth: string;
  blockNumber?: bigint;
}

// ERC721 Transfer event topic0
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function monitorTransaction(
  txHash: `0x${string}`,
  nftContractAddress: Address,
  timeoutSeconds?: number
): Promise<TxMonitorResult> {
  const timeout = (timeoutSeconds ?? config.mint.txTimeoutSeconds) * 1000;
  const pollInterval = 2000; // Reduced from 5s to 2s for faster feedback
  const startTime = Date.now();

  logger.info(`[TX_MONITOR] Monitoring tx ${txHash}`);

  while (Date.now() - startTime < timeout) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

      if (receipt) {
        if (receipt.status === 'reverted') {
          logger.warn(`[TX_MONITOR] Transaction ${txHash} reverted`);
          return {
            status: 'FAILED',
            tokenIds: [],
            gasUsedEth: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
            blockNumber: receipt.blockNumber,
          };
        }

        // Parse Transfer(from, to, tokenId) events — tokenId is topics[3]
        const tokenIds: string[] = [];
        for (const log of receipt.logs) {
          if (
            log.address.toLowerCase() === nftContractAddress.toLowerCase() &&
            log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
            log.topics.length >= 4 &&
            log.topics[3]
          ) {
            try {
              const tokenId = BigInt(log.topics[3]).toString();
              tokenIds.push(tokenId);
            } catch {
              // skip malformed log
            }
          }
        }

        const gasUsedEth = formatEther(receipt.gasUsed * receipt.effectiveGasPrice);
        logger.info(`[TX_MONITOR] Transaction ${txHash} confirmed. TokenIds: [${tokenIds.join(', ')}], Gas: ${gasUsedEth} ETH`);

        return {
          status: 'CONFIRMED',
          tokenIds,
          gasUsedEth,
          blockNumber: receipt.blockNumber,
        };
      }
    } catch (err) {
      logger.warn(`[TX_MONITOR] Error polling receipt: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  logger.warn(`[TX_MONITOR] Transaction ${txHash} timed out after ${timeoutSeconds ?? config.mint.txTimeoutSeconds}s`);
  return {
    status: 'DROPPED',
    tokenIds: [],
    gasUsedEth: '0',
  };
}
