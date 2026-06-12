import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { Address } from 'viem';

interface GoPlusNftResult {
  is_honeypot?: string;
  malicious_behavior?: string[];
  [key: string]: unknown;
}

interface GoPlusResponse {
  code: number;
  message: string;
  result: Record<string, GoPlusNftResult>;
}

export async function checkGoPlus(contractAddress: Address): Promise<string | null> {
  try {
    const url = `${config.goplus.baseUrl}/api/v1/nft_security/1?contract_addresses=${contractAddress}`;
    const response = await axios.get<GoPlusResponse>(url, { timeout: 10000 });

    if (response.data.code !== 1) {
      logger.warn(`[GOPLUS] API returned non-success code: ${response.data.code}`);
      if (config.goplus.strictMode) {
        return 'GoPlus security check unavailable (strict mode enabled)';
      }
      return null;
    }

    const result = response.data.result[contractAddress.toLowerCase()];
    if (!result) {
      logger.warn(`[GOPLUS] No result for contract ${contractAddress}`);
      return null;
    }

    if (result.is_honeypot === '1') {
      return `Contract flagged as honeypot by GoPlus Security`;
    }

    if (result.malicious_behavior && result.malicious_behavior.length > 0) {
      return `Contract flagged for malicious behavior by GoPlus: ${result.malicious_behavior.join(', ')}`;
    }

    logger.info(`[GOPLUS] Contract ${contractAddress} passed security check`);
    return null;
  } catch (err) {
    logger.warn(`[GOPLUS] Security check failed: ${err instanceof Error ? err.message : 'unknown'}`);
    if (config.goplus.strictMode) {
      return 'GoPlus security check failed (strict mode enabled). Please try again.';
    }
    return null; // fail open
  }
}
