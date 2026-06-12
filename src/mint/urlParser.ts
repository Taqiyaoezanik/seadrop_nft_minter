import { getAddress } from 'viem';
import type { Address } from 'viem';

export type ParsedUrlType = 'slug' | 'contract';

export interface ParsedUrl {
  type: ParsedUrlType;
  slug?: string;
  contractAddress?: Address;
  raw: string;
}

const OPENSEA_COLLECTION_REGEX = /^https?:\/\/(www\.)?opensea\.io\/collection\/([a-zA-Z0-9_-]+)\/?$/;
const OPENSEA_ASSETS_REGEX = /^https?:\/\/(www\.)?opensea\.io\/assets\/ethereum\/(0x[a-fA-F0-9]{40})(?:\/\d+)?\/?$/;

export function parseOpenSeaUrl(raw: string): ParsedUrl {
  const trimmed = raw.trim();

  try {
    const url = new URL(trimmed);
    if (!['opensea.io', 'www.opensea.io'].includes(url.hostname)) {
      throw new Error('Invalid domain: only opensea.io URLs are supported');
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid domain')) throw err;
    throw new Error('Invalid URL format');
  }

  const collectionMatch = OPENSEA_COLLECTION_REGEX.exec(trimmed);
  if (collectionMatch) {
    const slug = collectionMatch[2];
    if (!slug) throw new Error('Could not extract collection slug from URL');
    return { type: 'slug', slug, raw: trimmed };
  }

  const assetsMatch = OPENSEA_ASSETS_REGEX.exec(trimmed);
  if (assetsMatch) {
    const rawAddress = assetsMatch[2];
    if (!rawAddress) throw new Error('Could not extract contract address from URL');
    // Checksum address (EIP-55) — viem will reject non-checksummed addresses
    let contractAddress: Address;
    try {
      contractAddress = getAddress(rawAddress);
    } catch {
      throw new Error(`Invalid contract address in URL: ${rawAddress}`);
    }
    return { type: 'contract', contractAddress, raw: trimmed };
  }

  throw new Error(
    'Unsupported OpenSea URL format. Use:\n' +
    '\u2022 https://opensea.io/collection/{slug}\n' +
    '\u2022 https://opensea.io/assets/ethereum/{contract}/{tokenId}'
  );
}
