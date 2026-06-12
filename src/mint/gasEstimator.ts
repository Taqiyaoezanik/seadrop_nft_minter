import { formatEther } from 'viem';
import { publicClient, getLatestBaseFee } from '../rpc/client';
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
  userMaxGasEth: string
): Promise<GasEstimate> {
  logger.info(`[GAS] Estimating gas for mint tx from ${fromAddress.slice(0, 8)}...`);

  const rawEstimate = await publicClient.estimateGas({
    account: fromAddress,
    to: calldata.to,
    data: calldata.data,
    value: calldata.value,
  });

  // Apply 20% buffer
  const gasLimit = (rawEstimate * 120n) / 100n;

  const baseFee = await getLatestBaseFee();
  const maxPriorityFeePerGas = BigInt(config.mint.maxPriorityFeeGwei) * 1_000_000_000n;
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;

  const totalGasCostWei = gasLimit * maxFeePerGas;
  const totalGasCostEth = formatEther(totalGasCostWei);

  logger.info(`[GAS] Estimated gas: ${gasLimit}, maxFeePerGas: ${maxFeePerGas}, total: ${totalGasCostEth} ETH`);

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
