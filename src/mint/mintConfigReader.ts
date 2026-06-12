import { publicClient } from '../rpc/client';
import { logger } from '../utils/logger';
import type { Address } from 'viem';
import SeaDropV1Abi from '../../abis/SeaDropV1.json';
import type { PublicDrop } from './seadropDetector';

export interface MintStats {
  minterNumMinted: bigint;
  currentTotalSupply: bigint;
  maxSupply: bigint;
}

export interface MintConfig {
  publicDrop: PublicDrop;
  feeRecipient: Address;
  mintStats: MintStats;
  seaDropAddress: Address;
  nftContractAddress: Address;
}

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

export async function readMintConfig(
  nftContract: Address,
  seaDropAddress: Address,
  walletAddress: Address,
  publicDrop: PublicDrop
): Promise<MintConfig> {
  logger.info(`[MINT_CONFIG] Reading mint config for ${nftContract}`);

  // Get fee recipients from SeaDrop contract
  let feeRecipient: Address = ZERO_ADDRESS;
  try {
    const feeRecipients = await publicClient.readContract({
      address: seaDropAddress,
      abi: SeaDropV1Abi,
      functionName: 'getFeeRecipients',
      args: [nftContract],
    }) as Address[];

    if (feeRecipients.length > 0 && feeRecipients[0]) {
      feeRecipient = feeRecipients[0];
      logger.info(`[MINT_CONFIG] Fee recipient: ${feeRecipient}`);
    } else {
      logger.info('[MINT_CONFIG] No fee recipients registered, using address(0)');
    }
  } catch (err) {
    logger.warn(
      `[MINT_CONFIG] Failed to get fee recipients: ${err instanceof Error ? err.message : 'unknown'}, using address(0)`
    );
  }

  // Get mint stats from SeaDrop contract — MUST use 2-param version on SeaDrop, not NFT contract
  let mintStats: MintStats = {
    minterNumMinted: 0n,
    currentTotalSupply: 0n,
    maxSupply: 0n,
  };
  try {
    const result = await publicClient.readContract({
      address: seaDropAddress,
      abi: SeaDropV1Abi,
      functionName: 'getMintStats',
      args: [nftContract, walletAddress],
    }) as [bigint, bigint, bigint];

    mintStats = {
      minterNumMinted: result[0] ?? 0n,
      currentTotalSupply: result[1] ?? 0n,
      maxSupply: result[2] ?? 0n,
    };
    logger.info(
      `[MINT_CONFIG] Mint stats — minted: ${mintStats.minterNumMinted}, supply: ${mintStats.currentTotalSupply}/${mintStats.maxSupply}`
    );
  } catch (err) {
    logger.warn(`[MINT_CONFIG] Failed to get mint stats: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  return {
    publicDrop,
    feeRecipient,
    mintStats,
    seaDropAddress,
    nftContractAddress: nftContract,
  };
}
