import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { Address } from 'viem';
import type { ParsedUrl } from './urlParser';

export interface CollectionInfo {
  contractAddress: Address;
  collectionName: string;
  collectionSlug: string;
  totalSupply: number | null;
}

interface OpenSeaContract {
  address: string;
  chain: string;
}

interface OpenSeaCollectionResponse {
  name: string;
  collection: string;
  contracts: OpenSeaContract[];
  total_supply?: number;
}

async function fetchWithRetry<T>(url: string, headers: Record<string, string>, retries = 3): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get<T>(url, { headers, timeout: 10000 });
      return response.data;
    } catch (err) {
      if (err instanceof AxiosError) {
        if (err.response?.status === 429) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`[COLLECTION] Rate limited by OpenSea API, retrying in ${delay}ms (attempt ${attempt}/${retries})`);
          await new Promise((r) => setTimeout(r, delay));
          lastError = new Error('OpenSea API rate limit exceeded');
          continue;
        }
        if (err.response?.status === 404) {
          throw new Error('Collection not found on OpenSea');
        }
        lastError = new Error(`OpenSea API error: ${err.response?.status ?? err.message}`);
      } else {
        lastError = err instanceof Error ? err : new Error('Unknown error');
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

export async function resolveCollection(parsed: ParsedUrl): Promise<CollectionInfo> {
  const headers = {
    'x-api-key': config.opensea.apiKey,
    'Accept': 'application/json',
  };

  // Type B: contract address already in URL — skip OpenSea API, go straight to chain
  if (parsed.type === 'contract' && parsed.contractAddress) {
    // Try to get collection name from OpenSea by contract address
    try {
      const url = `${config.opensea.baseUrl}/api/v2/chain/ethereum/contract/${parsed.contractAddress}`;
      const data = await fetchWithRetry<{ collection: string; name?: string }>(url, headers);
      return {
        contractAddress: parsed.contractAddress,
        collectionName: data.name ?? data.collection ?? 'Unknown Collection',
        collectionSlug: data.collection ?? '',
        totalSupply: null,
      };
    } catch {
      // If lookup fails, proceed with address only
      return {
        contractAddress: parsed.contractAddress,
        collectionName: 'Unknown Collection',
        collectionSlug: '',
        totalSupply: null,
      };
    }
  }

  if (!parsed.slug) {
    throw new Error('No slug available to resolve collection');
  }

  const url = `${config.opensea.baseUrl}/api/v2/collections/${parsed.slug}`;
  const data = await fetchWithRetry<OpenSeaCollectionResponse>(url, headers);

  const ethereumContracts = data.contracts.filter(
    (c) => c.chain === 'ethereum'
  );

  if (ethereumContracts.length === 0) {
    throw new Error('Collection is not on Ethereum mainnet. Only Ethereum mainnet is supported.');
  }

  const firstContract = ethereumContracts[0];
  if (!firstContract) {
    throw new Error('No Ethereum contract found for this collection');
  }

  return {
    contractAddress: firstContract.address as Address,
    collectionName: data.name,
    collectionSlug: data.collection,
    totalSupply: data.total_supply ?? null,
  };
}
