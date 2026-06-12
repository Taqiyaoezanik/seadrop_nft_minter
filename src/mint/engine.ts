import { v4 as uuidv4 } from 'uuid';
import { formatEther } from 'viem';
import { parseOpenSeaUrl } from './urlParser';
import { resolveCollection } from './collectionResolver';
import { detectActiveSeaDrop } from './seadropDetector';
import { readMintConfig } from './mintConfigReader';
import { buildMintCalldata } from './calldataBuilder';
import { estimateGas } from './gasEstimator';
import { sendMintTransaction } from './transactionSender';
import { monitorTransaction } from './txMonitor';
import { validateMint } from '../risk/validator';
import { walletPool } from '../wallet/pool';
import { createJob, updateJobStatus } from '../db/mintJobs';
import { logAction } from '../db/auditLogs';
import { getUserSettings } from '../db/users';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface MintJobInput {
  telegramId: string;
  url: string;
}

export interface MintEngineResult {
  jobId: string;
  status: 'CONFIRMED' | 'FAILED' | 'DROPPED' | 'CANCELLED';
  txHash?: string;
  tokenIds?: string[];
  gasUsedEth?: string;
  errorMessage?: string;
  collectionName?: string;
}

export async function runMintJob(
  input: MintJobInput,
  onStatusUpdate?: (jobId: string, message: string) => Promise<void>
): Promise<MintEngineResult> {
  const jobId = uuidv4();
  const { telegramId, url } = input;

  const userSettings = getUserSettings(telegramId, {
    max_mint_price_eth: config.mint.defaultMaxMintPriceEth,
    max_gas_eth: config.mint.defaultMaxGasEth,
    quantity: config.mint.defaultQuantity,
  });

  logger.info(`[ENGINE] Starting mint job ${jobId} for user ${telegramId}`);
  logAction(telegramId, 'MINT_START', { jobId, url });

  createJob({ id: jobId, telegram_id: telegramId });

  const fail = async (reason: string): Promise<MintEngineResult> => {
    updateJobStatus(jobId, 'FAILED', { error_message: reason });
    logAction(telegramId, 'MINT_FAILED', { jobId, reason });
    logger.warn(`[ENGINE] Job ${jobId} failed: ${reason}`);
    return { jobId, status: 'FAILED', errorMessage: reason };
  };

  try {
    // Step 1: Parse URL
    let parsedUrl;
    try {
      parsedUrl = parseOpenSeaUrl(url);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Invalid URL');
    }

    // Step 2: Resolve collection
    let collection;
    try {
      collection = await resolveCollection(parsedUrl);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Failed to resolve collection');
    }

    updateJobStatus(jobId, 'PENDING', {
      collection_name: collection.collectionName,
      contract_address: collection.contractAddress,
    });

    // Step 3: Risk validation
    const validationError = await validateMint(collection.contractAddress, telegramId);
    if (validationError) {
      return fail(validationError);
    }

    // Step 4: Detect active SeaDrop
    const seaDropTarget = await detectActiveSeaDrop(collection.contractAddress);
    if (!seaDropTarget) {
      return fail('Not a SeaDrop collection or no active public drop found');
    }

    // Step 5: Acquire wallet
    const wallet = walletPool.acquireWallet();
    if (!wallet) {
      return fail('No available wallets in pool. All wallets are busy.');
    }

    updateJobStatus(jobId, 'PROCESSING', {
      wallet_address: wallet.address,
      seadrop_address: seaDropTarget.address,
    });

    if (onStatusUpdate) {
      await onStatusUpdate(jobId, 'processing');
    }

    try {
      // Step 6: Read full mint config
      const mintConfig = await readMintConfig(
        collection.contractAddress,
        seaDropTarget.address,
        wallet.address,
        seaDropTarget.publicDrop
      );

      // Step 7: Validate mint conditions
      const now = BigInt(Math.floor(Date.now() / 1000));

      if (mintConfig.publicDrop.startTime > now) {
        walletPool.releaseWallet(wallet.address);
        return fail(
          `Mint has not started yet. Starts at ${new Date(Number(mintConfig.publicDrop.startTime) * 1000).toUTCString()}`
        );
      }
      if (mintConfig.publicDrop.endTime > 0n && mintConfig.publicDrop.endTime < now) {
        walletPool.releaseWallet(wallet.address);
        return fail('Mint has ended');
      }
      if (
        mintConfig.mintStats.maxSupply > 0n &&
        mintConfig.mintStats.currentTotalSupply >= mintConfig.mintStats.maxSupply
      ) {
        walletPool.releaseWallet(wallet.address);
        return fail('Mint supply is exhausted');
      }

      const mintPriceEth = formatEther(mintConfig.publicDrop.mintPrice);
      const userMaxPriceWei = BigInt(Math.floor(parseFloat(userSettings.max_mint_price_eth) * 1e18));
      if (mintConfig.publicDrop.mintPrice > userMaxPriceWei) {
        walletPool.releaseWallet(wallet.address);
        return fail(
          `Mint price (${mintPriceEth} ETH) exceeds your max price limit (${userSettings.max_mint_price_eth} ETH). Use /set_maxprice to increase.`
        );
      }

      const remainingMints =
        mintConfig.publicDrop.maxTotalMintableByWallet - Number(mintConfig.mintStats.minterNumMinted);
      const quantity = Math.min(
        userSettings.quantity,
        remainingMints > 0 ? remainingMints : userSettings.quantity
      );
      if (quantity <= 0) {
        walletPool.releaseWallet(wallet.address);
        return fail('Wallet has already reached the max mint limit for this collection');
      }

      updateJobStatus(jobId, 'PROCESSING', { mint_price_eth: mintPriceEth });

      // Step 8: Build calldata
      const calldata = buildMintCalldata(mintConfig, quantity);

      // Step 9: Estimate gas
      let gasEstimate;
      try {
        gasEstimate = await estimateGas(calldata, wallet.address, userSettings.max_gas_eth);
      } catch (err) {
        walletPool.releaseWallet(wallet.address);
        return fail(err instanceof Error ? err.message : 'Gas estimation failed');
      }

      // Step 10: Get private key and send tx
      const privateKey = walletPool.getPrivateKey(wallet.address);
      if (!privateKey) {
        walletPool.releaseWallet(wallet.address);
        return fail('Could not retrieve wallet private key');
      }

      let txHash: `0x${string}`;
      try {
        const result = await sendMintTransaction(calldata, privateKey, gasEstimate);
        txHash = result.txHash;
      } catch (err) {
        walletPool.releaseWallet(wallet.address);
        return fail(err instanceof Error ? err.message : 'Failed to send transaction');
      }

      updateJobStatus(jobId, 'PROCESSING', { tx_hash: txHash });

      if (onStatusUpdate) {
        await onStatusUpdate(jobId, 'monitoring');
      }

      // Step 11: Monitor transaction
      const monitorResult = await monitorTransaction(txHash, collection.contractAddress);

      walletPool.releaseWallet(wallet.address);

      if (monitorResult.status === 'CONFIRMED') {
        updateJobStatus(jobId, 'CONFIRMED', {
          tx_hash: txHash,
          token_ids: monitorResult.tokenIds,
          gas_used_eth: monitorResult.gasUsedEth,
        });
        logAction(telegramId, 'MINT_CONFIRMED', { jobId, txHash });
        return {
          jobId,
          status: 'CONFIRMED',
          txHash,
          tokenIds: monitorResult.tokenIds,
          gasUsedEth: monitorResult.gasUsedEth,
          collectionName: collection.collectionName,
        };
      } else {
        updateJobStatus(jobId, monitorResult.status, {
          tx_hash: txHash,
          error_message:
            monitorResult.status === 'DROPPED' ? 'Transaction timed out' : 'Transaction reverted',
        });
        return {
          jobId,
          status: monitorResult.status,
          txHash,
          errorMessage:
            monitorResult.status === 'DROPPED'
              ? 'Transaction timed out'
              : 'Transaction reverted on-chain',
          collectionName: collection.collectionName,
        };
      }
    } catch (err) {
      walletPool.releaseWallet(wallet.address);
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return fail(message);
  }
}
