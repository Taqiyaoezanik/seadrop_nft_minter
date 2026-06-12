import { publicClient } from '../rpc/client';
import { logger } from '../utils/logger';
import type { Address } from 'viem';
import SeaDropV1Abi from '../../abis/SeaDropV1.json';
import ERC721SeaDropAbi from '../../abis/ERC721SeaDrop.json';

export const SEADROP_V1_ADDRESS = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5' as Address;
export const SEADROP_V1_1_ADDRESS = '0x0000000000664ceffed39244a8312bD895470803' as Address;
export const SEADROP_INTERFACE_ID = '0x1b73a703' as `0x${string}`;

export type SeaDropVersion = 'v1' | 'v1.1';

const KNOWN_SEADROP: Record<string, SeaDropVersion> = {
  [SEADROP_V1_ADDRESS.toLowerCase()]: 'v1',
  [SEADROP_V1_1_ADDRESS.toLowerCase()]: 'v1.1',
};

export interface PublicDrop {
  mintPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  maxTotalMintableByWallet: number;
  feeBps: number;
  restrictFeeRecipients: boolean;
}

export interface SeaDropTarget {
  address: Address;
  version: SeaDropVersion;
  publicDrop: PublicDrop;
}

async function checkSupportsInterface(nftContract: Address, interfaceId: `0x${string}`): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: nftContract,
      abi: ERC721SeaDropAbi,
      functionName: 'supportsInterface',
      args: [interfaceId],
    }) as boolean;
  } catch {
    return false;
  }
}

async function getAllowedSeaDrop(nftContract: Address): Promise<Address[]> {
  try {
    return await publicClient.readContract({
      address: nftContract,
      abi: ERC721SeaDropAbi,
      functionName: 'getAllowedSeaDrop',
    }) as Address[];
  } catch {
    return [];
  }
}

async function getPublicDrop(seaDropAddress: Address, nftContract: Address): Promise<PublicDrop | null> {
  try {
    const result = await publicClient.readContract({
      address: seaDropAddress,
      abi: SeaDropV1Abi,
      functionName: 'getPublicDrop',
      args: [nftContract],
    }) as PublicDrop;
    return result;
  } catch {
    return null;
  }
}

export async function detectActiveSeaDrop(nftContract: Address): Promise<SeaDropTarget | null> {
  logger.info(`[SEADROP] Detecting SeaDrop for contract ${nftContract}`);

  const isSeaDropToken = await checkSupportsInterface(nftContract, SEADROP_INTERFACE_ID);
  if (!isSeaDropToken) {
    logger.info(`[SEADROP] Contract ${nftContract} does not support INonFungibleSeaDropToken interface`);
    return null;
  }

  const allowedAddresses = await getAllowedSeaDrop(nftContract);
  if (allowedAddresses.length === 0) {
    logger.info(`[SEADROP] No allowed SeaDrop addresses found for ${nftContract}`);
    return null;
  }

  for (const seaDropAddr of allowedAddresses) {
    const version = KNOWN_SEADROP[seaDropAddr.toLowerCase()];
    if (!version) {
      logger.warn(`[SEADROP] Unknown SeaDrop address ${seaDropAddr}, skipping`);
      continue;
    }

    const publicDrop = await getPublicDrop(seaDropAddr, nftContract);
    if (!publicDrop) continue;

    // Use startTime > 0 as indicator of active config (handles free mints where mintPrice = 0)
    if (publicDrop.startTime > 0n) {
      logger.info(`[SEADROP] Found active drop on SeaDrop ${version} at ${seaDropAddr}`);
      return {
        address: seaDropAddr,
        version,
        publicDrop,
      };
    }
  }

  logger.info(`[SEADROP] No active drop config found on any allowed SeaDrop address`);
  return null;
}
