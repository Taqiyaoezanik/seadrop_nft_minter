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
// OpenSea protocol fee recipient used by SeaDrop V1 collections
const OPENSEA_FEE_RECIPIENT: Address = '0x0000a26b00c1F0DF003000390027140000fAa719';

export async function readMintConfig(
  nftContract: Address,
  seaDropAddress: Address,
  walletAddress: Address,
  publicDrop: PublicDrop
): Promise<MintConfig> {
  logger.info(`[MINT_CONFIG] Reading mint config for ${nftContract}`);

  // Get fee recipients from SeaDrop contract
  // SeaDrop requires a valid fee recipient — address(0) will cause revert
  let feeRecipient: Address = OPENSEA_FEE_RECIPIENT; // safe default
  try {
    const feeRecipients = await publicClient.readContract({
      address: seaDropAddress,
      abi: SeaDropV1Abi,
      functionName: 'getFeeRecipients',
      args: [nftContract],
    }) as Address[];

    if (feeRecipients.length > 0 && feeRecipients[0] && feeRecipients[0] !== ZERO_ADDRESS) {
      feeRecipient = feeRecipients[0];
      logger.info(`[MINT_CONFIG] Fee recipient: ${feeRecipient}`);
    } else {
      logger.info(`[MINT_CONFIG] No fee recipients found, using OpenSea default: ${OPENSEA_FEE_RECIPIENT}`);
    }
  } catch {
    logger.info(`[MINT_CONFIG] getFeeRecipients reverted, using OpenSea default fee recipient: ${OPENSEA_FEE_RECIPIENT}`);
  }

  // Get mint stats — try SeaDrop contract first, fallback to NFT contract directly
  let mintStats: MintStats = {
    minterNumMinted: 0n,
    currentTotalSupply: 0n,
    maxSupply: 0n,
  };

  const NFT_MINT_STATS_ABI = [{
    name: 'getMintStats',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'minter', type: 'address' }],
    outputs: [
      { name: 'minterNumMinted', type: 'uint256' },
      { name: 'currentTotalSupply', type: 'uint256' },
      { name: 'maxSupply', type: 'uint256' },
    ],
  }] as const;

  try {
    // Try SeaDrop contract (2-param version)
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
      `[MINT_CONFIG] Mint stats (SeaDrop) — minted: ${mintStats.minterNumMinted}, supply: ${mintStats.currentTotalSupply}/${mintStats.maxSupply}`
    );
  } catch {
    // Fallback: read getMintStats directly from NFT contract (1-param version)
    try {
      const result = await publicClient.readContract({
        address: nftContract,
        abi: NFT_MINT_STATS_ABI,
        functionName: 'getMintStats',
        args: [walletAddress],
      });
      mintStats = {
        minterNumMinted: result.minterNumMinted,
        currentTotalSupply: result.currentTotalSupply,
        maxSupply: result.maxSupply,
      };
      logger.info(
        `[MINT_CONFIG] Mint stats (NFT contract) — minted: ${mintStats.minterNumMinted}, supply: ${mintStats.currentTotalSupply}/${mintStats.maxSupply}`
      );
    } catch (err) {
      logger.warn(`[MINT_CONFIG] Failed to get mint stats from both sources: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return {
    publicDrop,
    feeRecipient,
    mintStats,
    seaDropAddress,
    nftContractAddress: nftContract,
  };
}
