import { encodeFunctionData } from 'viem';
import type { Address } from 'viem';
import SeaDropV1Abi from '../../abis/SeaDropV1.json';
import type { MintConfig } from './mintConfigReader';

export interface MintCalldata {
  to: Address;
  data: `0x${string}`;
  value: bigint;
}

export function buildMintCalldata(
  mintConfig: MintConfig,
  quantity: number
): MintCalldata {
  const { seaDropAddress, nftContractAddress, feeRecipient, publicDrop } = mintConfig;

  const data = encodeFunctionData({
    abi: SeaDropV1Abi,
    functionName: 'mintPublic',
    args: [
      nftContractAddress,
      feeRecipient,
      '0x0000000000000000000000000000000000000000' as Address,
      BigInt(quantity),
    ],
  });

  const value = publicDrop.mintPrice * BigInt(quantity);

  return {
    to: seaDropAddress,
    data,
    value,
  };
}
