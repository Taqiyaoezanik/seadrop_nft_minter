import { formatEther, getAddress, BaseError } from 'viem';
import type { Address } from 'viem';
import { parseOpenSeaUrl } from './urlParser';
import { resolveCollection } from './collectionResolver';
import { detectActiveSeaDrop } from './seadropDetector';
import { readMintConfig } from './mintConfigReader';
import { buildMintCalldata } from './calldataBuilder';
import { estimateGas } from './gasEstimator';
import { validateMint } from '../risk/validator';
import { walletPool } from '../wallet/pool';
import { getUserSettings } from '../db/users';
import { publicClient } from '../rpc/client';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface DryRunCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface DryRunResult {
  ok: boolean;
  collectionName?: string;
  contractAddress?: string;
  seaDropAddress?: string;
  seaDropVersion?: string;
  phase: string;
  quantity?: number;
  mintPriceEth?: string;
  gasEstimateEth?: string;
  checks: DryRunCheck[];
  simulationRan: boolean;
  simulationSuccess: boolean;
  revertReason?: string;
}

/**
 * Extract a human-readable revert reason from a Viem error.
 */
function extractRevertReason(err: unknown): string {
  if (err instanceof BaseError) {
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

/**
 * Run the full mint pipeline as a simulation.
 * Never broadcasts a transaction and never mutates wallet pool state.
 */
export async function runDryRun(telegramId: string, url: string): Promise<DryRunResult> {
  const checks: DryRunCheck[] = [];
  const result: DryRunResult = {
    ok: false,
    phase: 'public',
    checks,
    simulationRan: false,
    simulationSuccess: false,
  };

  logger.info(`[DRY_RUN] Starting dry-run for user ${telegramId}: ${url}`);

  const userSettings = getUserSettings(telegramId, {
    max_mint_price_eth: config.mint.defaultMaxMintPriceEth,
    max_gas_eth: config.mint.defaultMaxGasEth,
    quantity: config.mint.defaultQuantity,
  });

  // Step 1: Parse URL
  let parsedUrl;
  try {
    parsedUrl = parseOpenSeaUrl(url);
    checks.push({ name: 'URL valid (opensea.io)', passed: true });
  } catch (err) {
    checks.push({
      name: 'URL valid (opensea.io)',
      passed: false,
      detail: err instanceof Error ? err.message : 'Invalid URL',
    });
    return result;
  }

  // Step 2: Resolve collection
  let contractAddress: Address;
  try {
    const collection = await resolveCollection(parsedUrl);
    contractAddress = getAddress(collection.contractAddress);
    result.collectionName = collection.collectionName;
    result.contractAddress = contractAddress;
    checks.push({ name: 'Collection resolved', passed: true, detail: collection.collectionName });
  } catch (err) {
    checks.push({
      name: 'Collection resolved',
      passed: false,
      detail: err instanceof Error ? err.message : 'Failed to resolve collection',
    });
    return result;
  }

  // Step 3: Risk validation (blacklist + GoPlus)
  const validationError = await validateMint(contractAddress, telegramId);
  checks.push({
    name: 'Risk validation (blacklist + GoPlus)',
    passed: validationError === null,
    detail: validationError ?? undefined,
  });
  if (validationError) {
    return result;
  }

  // Step 4: SeaDrop detection
  const seaDropTarget = await detectActiveSeaDrop(contractAddress);
  checks.push({
    name: 'SeaDrop interface detected',
    passed: seaDropTarget !== null,
    detail: seaDropTarget ? `SeaDrop ${seaDropTarget.version}` : 'No active public drop found',
  });
  if (!seaDropTarget) {
    return result;
  }
  result.seaDropAddress = seaDropTarget.address;
  result.seaDropVersion = seaDropTarget.version;

  // Step 5: Pick a wallet address for read-only calls — pool state is NOT modified
  const poolStatus = walletPool.getPoolStatus();
  const walletAddress = poolStatus[0]?.address;
  checks.push({
    name: 'Wallet available in pool',
    passed: walletAddress !== undefined,
    detail: walletAddress
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : 'No wallets loaded in pool',
  });
  if (!walletAddress) {
    return result;
  }

  try {
    // Step 6: Read full mint config
    const mintConfig = await readMintConfig(
      contractAddress,
      seaDropTarget.address,
      walletAddress,
      seaDropTarget.publicDrop
    );
    result.mintPriceEth = formatEther(mintConfig.publicDrop.mintPrice);

    // Step 7: Time window
    const now = BigInt(Math.floor(Date.now() / 1000));
    const notStarted = mintConfig.publicDrop.startTime > now;
    const ended = mintConfig.publicDrop.endTime > 0n && mintConfig.publicDrop.endTime < now;
    checks.push({
      name: 'Mint currently active',
      passed: !notStarted && !ended,
      detail: notStarted
        ? `Starts at ${new Date(Number(mintConfig.publicDrop.startTime) * 1000).toUTCString()}`
        : ended
          ? 'Mint has ended'
          : undefined,
    });

    // Step 8: Supply
    const supplyExhausted =
      mintConfig.mintStats.maxSupply > 0n &&
      mintConfig.mintStats.currentTotalSupply >= mintConfig.mintStats.maxSupply;
    checks.push({
      name: 'Supply available',
      passed: !supplyExhausted,
      detail: `${mintConfig.mintStats.currentTotalSupply}/${
        mintConfig.mintStats.maxSupply > 0n ? mintConfig.mintStats.maxSupply : 'unlimited'
      } minted`,
    });

    // Step 9: Per-wallet mint limit
    const remainingMints =
      mintConfig.publicDrop.maxTotalMintableByWallet - Number(mintConfig.mintStats.minterNumMinted);
    checks.push({
      name: 'Per-wallet mint limit',
      passed: remainingMints > 0,
      detail: `${Math.max(0, remainingMints)} of ${mintConfig.publicDrop.maxTotalMintableByWallet} remaining`,
    });

    const quantity = Math.max(1, Math.min(userSettings.quantity, remainingMints));
    result.quantity = quantity;

    // Step 10: Mint price vs user limit
    const parsedMaxPrice = parseFloat(userSettings.max_mint_price_eth);
    const userMaxPriceWei = BigInt(Math.floor((isNaN(parsedMaxPrice) ? 0 : parsedMaxPrice) * 1e18));
    checks.push({
      name: 'Mint price within limit',
      passed: mintConfig.publicDrop.mintPrice <= userMaxPriceWei,
      detail: `${result.mintPriceEth} ETH (limit ${userSettings.max_mint_price_eth} ETH)`,
    });

    // Step 11: Build calldata + gas estimate
    const calldata = buildMintCalldata(mintConfig, quantity, walletAddress);
    try {
      const gasEstimate = await estimateGas(calldata, walletAddress, userSettings.max_gas_eth);
      result.gasEstimateEth = gasEstimate.totalGasCostEth;
      checks.push({
        name: 'Gas estimate within limit',
        passed: true,
        detail: `${gasEstimate.totalGasCostEth} ETH (limit ${userSettings.max_gas_eth} ETH)`,
      });
    } catch (err) {
      checks.push({
        name: 'Gas estimate within limit',
        passed: false,
        detail: extractRevertReason(err),
      });
    }

    // Step 12: On-chain simulation via eth_call — NO transaction is broadcast
    result.simulationRan = true;
    try {
      await publicClient.call({
        account: walletAddress,
        to: calldata.to,
        data: calldata.data,
        value: calldata.value,
      });
      result.simulationSuccess = true;
      checks.push({ name: 'On-chain simulation (eth_call)', passed: true });
    } catch (err) {
      result.simulationSuccess = false;
      result.revertReason = extractRevertReason(err);
      checks.push({
        name: 'On-chain simulation (eth_call)',
        passed: false,
        detail: result.revertReason,
      });
    }
  } catch (err) {
    checks.push({
      name: 'Mint config readable',
      passed: false,
      detail: err instanceof Error ? err.message : 'Failed to read mint config',
    });
    return result;
  }

  result.ok = checks.every((c) => c.passed);
  logger.info(`[DRY_RUN] Completed for ${result.contractAddress}: ${result.ok ? 'PASS' : 'FAIL'}`);
  return result;
}
