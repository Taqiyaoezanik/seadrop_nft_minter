import { createWalletClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { MintCalldata } from './calldataBuilder';
import type { GasEstimate } from './gasEstimator';

export interface SendTransactionResult {
  txHash: `0x${string}`;
}

export async function sendMintTransaction(
  calldata: MintCalldata,
  privateKey: `0x${string}`,
  gasEstimate: GasEstimate
): Promise<SendTransactionResult> {
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(config.rpc.primaryRpcUrl),
  });

  logger.info(
    `[TX] Sending mint tx from ${account.address.slice(0, 8)}... ` +
    `value: ${formatEther(calldata.value)} ETH`
  );

  const txHash = await walletClient.sendTransaction({
    to: calldata.to,
    data: calldata.data,
    value: calldata.value,
    gas: gasEstimate.gasLimit,
    maxFeePerGas: gasEstimate.maxFeePerGas,
    maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas,
    type: 'eip1559',
  });

  logger.info(`[TX] Transaction broadcast: ${txHash}`);

  return { txHash };
}
