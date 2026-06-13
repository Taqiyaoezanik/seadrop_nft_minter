import { formatEther } from 'viem';
import { publicClient, getLatestBaseFee, getMaxPriorityFeePerGas } from '../rpc/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { Address } from 'viem';
import type { MintCalldata } from './calldataBuilder';

export interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  totalGasCostWei: bigint;
  totalGasCostEth: string;
}

export async function estimateGas(
  calldata: MintCalldata,
  fromAddress: Address,
  userMaxGasEth: string,
  priorityFeeGwei?: number
): Promise<GasEstimate> {
  logger.info(`[GAS] Estimating gas for mint tx from ${fromAddress.slice(0, 8)}...`);

  // Fetch baseFee first so we can log it even if estimateGas throws
  const baseFee = await getLatestBaseFee();
  logger.info(`[GAS] Current baseFee: ${baseFee} wei (${Number(baseFee) / 1e9} gwei)`);

  const rawEstimate = await publicClient.estimateGas({
    account: fromAddress,
    to: calldata.to,
    data: calldata.data,
    value: calldata.value,
  });

  logger.info(`[GAS] Raw gas estimate: ${rawEstimate}`);

  // Apply 10% buffer (reduced from 20% to minimize gas cost)
  const gasLimit = (rawEstimate * 110n) / 100n;

  // Use network priority fee if no user override, fallback to config
  let maxPriorityFeePerGas: bigint;
  if (priorityFeeGwei !== undefined) {
    maxPriorityFeePerGas = BigInt(Math.ceil(priorityFeeGwei * 1_000_000_000));
    logger.info(`[GAS] Using user priority fee: ${priorityFeeGwei} gwei`);
  } else {
    try {
      maxPriorityFeePerGas = await getMaxPriorityFeePerGas();
      // Cap at config max to prevent extremely high fees
      const configMaxWei = BigInt(Math.ceil(config.mint.maxPriorityFeeGwei * 1_000_000_000));
      if (maxPriorityFeePerGas > configMaxWei) {
        logger.warn(`[GAS] Network priority fee too high, capping at ${config.mint.maxPriorityFeeGwei} gwei`);
        maxPriorityFeePerGas = configMaxWei;
      }
    } catch (error) {
      logger.warn(`[GAS] Using fallback priority fee: ${config.mint.maxPriorityFeeGwei} gwei`);
      maxPriorityFeePerGas = BigInt(Math.ceil(config.mint.maxPriorityFeeGwei * 1_000_000_000));
    }
  }

  // No buffer on baseFee for minimal gas cost (aggressive pricing)
  // baseFee alone is sufficient; buffer was inflating costs unnecessarily
  const maxFeePerGas = baseFee + maxPriorityFeePerGas;

  const totalGasCostWei = gasLimit * maxFeePerGas;
  const totalGasCostEth = formatEther(totalGasCostWei);

  logger.info(
    `[GAS] maxFeePerGas: ${maxFeePerGas}, gasLimit: ${gasLimit}, total: ${totalGasCostEth} ETH`
  );

  // Check against user max gas setting
  const parsedMaxGas = parseFloat(userMaxGasEth);
  if (isNaN(parsedMaxGas) || parsedMaxGas <= 0) {
    throw new Error(`Invalid max gas setting: ${userMaxGasEth}`);
  }
  const userMaxGasWei = BigInt(Math.floor(parsedMaxGas * 1e18));
  if (totalGasCostWei > userMaxGasWei) {
    throw new Error(
      `Estimated gas cost (${totalGasCostEth} ETH) exceeds your max gas limit (${userMaxGasEth} ETH). ` +
      `Use /set_maxgas to increase the limit.`
    );
  }

  return {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    totalGasCostWei,
    totalGasCostEth,
  };
}
