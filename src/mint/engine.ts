import { formatEther, getAddress } from 'viem';
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
import { updateJobStatus } from '../db/mintJobs';
import { logAction } from '../db/auditLogs';
import { getUserSettings } from '../db/users';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface MintJobInput {
  telegramId: string;
  url: string;
  jobId: string; // jobId created by mintCommand before queuing
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
  const { telegramId, url, jobId } = input;

  const userSettings = getUserSettings(telegramId, {
    max_mint_price_eth: config.mint.defaultMaxMintPriceEth,
    max_gas_eth: config.mint.defaultMaxGasEth,
    quantity: config.mint.defaultQuantity,
  });

  logger.info(`[ENGINE] Starting mint job ${jobId} for user ${telegramId}`);
  logAction(telegramId, 'MINT_START', { jobId, url });

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

    // Checksum the contract address (EIP-55)
    let contractAddress;
    try {
      contractAddress = getAddress(collection.contractAddress);
    } catch {
      return fail(`Invalid contract address: ${collection.contractAddress}`);
    }

    updateJobStatus(jobId, 'PENDING', {
      collection_name: collection.collectionName,
      contract_address: contractAddress,
    });

    // Step 3: Risk validation (blacklist, etherscan, age, goplus)
    const validationError = await validateMint(contractAddress, telegramId);
    if (validationError) {
      return fail(validationError);
    }

    // Step 4: Detect active SeaDrop (supportsInterface + getAllowedSeaDrop + probe active drop)
    const seaDropTarget = await detectActiveSeaDrop(contractAddress);
    if (!seaDropTarget) {
      return fail('Not a SeaDrop collection or no active public drop found');
    }

    // Step 5: Read full mint config (feeRecipients + getMintStats from SeaDrop contract)
    // We need walletAddress for getMintStats — acquire wallet first
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
      const mintConfig = await readMintConfig(
        contractAddress,
        seaDropTarget.address,
        wallet.address,
        seaDropTarget.publicDrop // publicDrop passed from detector — no re-fetch
      );

      // Step 6: Validate time window
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

      // Step 7: Validate supply
      if (
        mintConfig.mintStats.maxSupply > 0n &&
        mintConfig.mintStats.currentTotalSupply >= mintConfig.mintStats.maxSupply
      ) {
        walletPool.releaseWallet(wallet.address);
        return fail('Mint supply is exhausted');
      }

      // Step 8: Validate per-wallet mint limit (FIXED: abort if limit reached)
      const remainingMints =
        mintConfig.publicDrop.maxTotalMintableByWallet -
        Number(mintConfig.mintStats.minterNumMinted);

      if (remainingMints <= 0) {
        walletPool.releaseWallet(wallet.address);
        return fail(
          `Wallet ${wallet.address.slice(0, 8)}... has already reached the max mint limit ` +
          `(${mintConfig.publicDrop.maxTotalMintableByWallet}) for this collection`
        );
      }

      const quantity = Math.min(userSettings.quantity, remainingMints);

      // Step 9: Validate mint price
      const mintPriceEth = formatEther(mintConfig.publicDrop.mintPrice);
      const parsedMaxPrice = parseFloat(userSettings.max_mint_price_eth);
      const userMaxPriceWei = BigInt(Math.floor((isNaN(parsedMaxPrice) ? 0 : parsedMaxPrice) * 1e18));
      if (mintConfig.publicDrop.mintPrice > userMaxPriceWei) {
        walletPool.releaseWallet(wallet.address);
        return fail(
          `Mint price (${mintPriceEth} ETH) exceeds your max price limit ` +
          `(${userSettings.max_mint_price_eth} ETH). Use /set_maxprice to increase.`
        );
      }

      updateJobStatus(jobId, 'PROCESSING', { mint_price_eth: mintPriceEth });

      // Step 10: Build calldata
      // tx.to = SeaDrop contract, nftContract = first arg in mintPublic()
      const calldata = buildMintCalldata(mintConfig, quantity);

      // Step 11: Estimate gas
      let gasEstimate;
      try {
        gasEstimate = await estimateGas(calldata, wallet.address, userSettings.max_gas_eth);
      } catch (err) {
        walletPool.releaseWallet(wallet.address);
        return fail(err instanceof Error ? err.message : 'Gas estimation failed');
      }

      // Step 12: Send transaction
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

      // Step 13: Monitor transaction — wallet released AFTER confirm/fail
      const monitorResult = await monitorTransaction(txHash, contractAddress);
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
            monitorResult.status === 'DROPPED'
              ? 'Transaction timed out — check Etherscan for status'
              : 'Transaction reverted on-chain',
        });
        return {
          jobId,
          status: monitorResult.status,
          txHash,
          errorMessage:
            monitorResult.status === 'DROPPED'
              ? 'Transaction timed out — check Etherscan for status'
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
