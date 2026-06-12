import { isBlacklisted } from '../db/blacklist';
import { checkGoPlus } from './goplusCheck';
import { logger } from '../utils/logger';
import type { Address } from 'viem';

export async function validateMint(
  contractAddress: Address,
  telegramId: string
): Promise<string | null> {
  logger.info(`[VALIDATOR] Running validation for contract ${contractAddress}`);

  // Check 1: Local blacklist
  if (isBlacklisted(contractAddress)) {
    return `Contract ${contractAddress} is blacklisted`;
  }

  // Check 2: GoPlus security
  try {
    const goPlusError = await checkGoPlus(contractAddress);
    if (goPlusError) return goPlusError;
  } catch (err) {
    logger.warn(`[VALIDATOR] GoPlus check failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  logger.info(`[VALIDATOR] All checks passed for ${contractAddress}`);
  return null;
}
