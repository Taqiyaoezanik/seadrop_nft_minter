import { publicClient } from '../rpc/client';
import { formatEther, parseAbiItem } from 'viem';
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

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');

export async function monitorTransaction(
  txHash: `0x${string}`,
  nftContractAddress: Address,
  timeoutSeconds?: number
): Promise<TxMonitorResult> {
  const timeout = (timeoutSeconds ?? config.mint.txTimeoutSeconds) * 1000;
  const pollInterval = 5000;
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

        // Parse Transfer events to extract tokenIds
        const tokenIds: string[] = [];
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() === nftContractAddress.toLowerCase()) {
            try {
              const decoded = publicClient.decodeEventLog ? 
                { eventName: 'Transfer', args: { tokenId: BigInt(log.topics[3] ?? '0x0') } } :
                null;
              // Manual decode: Transfer(from, to, tokenId) - tokenId is topics[3]
              if (log.topics.length >= 4 && log.topics[3]) {
                const tokenId = BigInt(log.topics[3]).toString();
                tokenIds.push(tokenId);
              }
            } catch {
              // skip malformed logs
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
