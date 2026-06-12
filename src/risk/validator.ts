import { isBlacklisted } from '../db/blacklist';
import { checkEtherscanVerified, checkContractAge } from './etherscanCheck';
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

  // Check 2: Etherscan contract verification
  try {
    const isVerified = await checkEtherscanVerified(contractAddress);
    if (!isVerified) {
      return `Contract ${contractAddress} is not verified on Etherscan. Aborting for safety.`;
    }
  } catch (err) {
    logger.warn(`[VALIDATOR] Etherscan verification check failed: ${err instanceof Error ? err.message : 'unknown'}`);
    return `Could not verify contract on Etherscan: ${err instanceof Error ? err.message : 'unknown'}`;
  }

  // Check 3: Contract age (must be > 1 hour old)
  try {
    const ageError = await checkContractAge(contractAddress);
    if (ageError) return ageError;
  } catch (err) {
    logger.warn(`[VALIDATOR] Contract age check failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // Check 4: GoPlus security
  try {
    const goPlusError = await checkGoPlus(contractAddress);
    if (goPlusError) return goPlusError;
  } catch (err) {
    logger.warn(`[VALIDATOR] GoPlus check failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  logger.info(`[VALIDATOR] All checks passed for ${contractAddress}`);
  return null;
}
