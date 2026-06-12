import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { Address } from 'viem';

interface EtherscanSourceResponse {
  status: string;
  result: Array<{
    SourceCode: string;
    ContractName: string;
  }>;
}

interface EtherscanTxListResponse {
  status: string;
  result: Array<{
    blockNumber: string;
    timeStamp: string;
    isError: string;
  }>;
}

export async function checkEtherscanVerified(contractAddress: Address): Promise<boolean> {
  try {
    const url = `${config.etherscan.baseUrl}/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${config.etherscan.apiKey}`;
    const response = await axios.get<EtherscanSourceResponse>(url, { timeout: 10000 });

    if (response.data.status !== '1' || !response.data.result.length) {
      return false;
    }

    const result = response.data.result[0];
    return !!(result && result.SourceCode && result.SourceCode.length > 0);
  } catch (err) {
    logger.warn(`[ETHERSCAN] Verification check error: ${err instanceof Error ? err.message : 'unknown'}`);
    throw err;
  }
}

export async function checkContractAge(contractAddress: Address): Promise<string | null> {
  try {
    const url = `${config.etherscan.baseUrl}/api?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${config.etherscan.apiKey}`;
    const response = await axios.get<EtherscanTxListResponse>(url, { timeout: 10000 });

    if (response.data.status !== '1' || !response.data.result.length) {
      logger.warn(`[ETHERSCAN] Could not determine contract age for ${contractAddress}`);
      return null;
    }

    const firstTx = response.data.result[0];
    if (!firstTx) return null;

    const deployTimestamp = parseInt(firstTx.timeStamp, 10) * 1000;
    const ageMs = Date.now() - deployTimestamp;
    const oneHourMs = 60 * 60 * 1000;

    if (ageMs < oneHourMs) {
      const ageMinutes = Math.floor(ageMs / 60000);
      return `Contract was deployed only ${ageMinutes} minute(s) ago. Minimum age is 1 hour for safety.`;
    }

    return null;
  } catch (err) {
    logger.warn(`[ETHERSCAN] Contract age check error: ${err instanceof Error ? err.message : 'unknown'}`);
    return null;
  }
}
