import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { Address } from 'viem';

export interface DropMintTransactionData {
  to: Address;
  data: `0x${string}`;
  value: string;
}

export interface DropMintError {
  code: 'NOT_ELIGIBLE' | 'DROP_INACTIVE' | 'NOT_FOUND' | 'SERVER_ERROR' | 'UNKNOWN';
  message: string;
  status: number;
}

export async function buildDropMintTransaction(
  slug: string,
  minter: Address,
  quantity: number
): Promise<{ success: true; data: DropMintTransactionData } | { success: false; error: DropMintError }> {
  try {
    const url = `${config.opensea.baseUrl}/api/v2/drops/${slug}/mint`;
    logger.info(`[DROP_MINT] Requesting mint transaction for ${slug} (minter: ${minter}, qty: ${quantity})`);

    const response = await axios.post<DropMintTransactionData>(
      url,
      {
        minter,
        quantity,
      },
      {
        headers: {
          'x-api-key': config.opensea.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000,
      }
    );

    logger.info(`[DROP_MINT] Successfully received mint transaction data`);
    return { success: true, data: response.data };
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status ?? 0;
      const responseData = err.response?.data;

      let errorCode: DropMintError['code'] = 'UNKNOWN';
      let message = 'Unknown error';

      if (status === 422) {
        errorCode = 'NOT_ELIGIBLE';
        message = 'Wallet not eligible for this drop (not in whitelist or limit reached)';
      } else if (status === 409) {
        errorCode = 'DROP_INACTIVE';
        message = 'Drop is not currently active for minting';
      } else if (status === 404) {
        errorCode = 'NOT_FOUND';
        message = 'Drop not found';
      } else if (status === 500 || status === 502 || status === 503) {
        errorCode = 'SERVER_ERROR';
        message = `OpenSea Drops API is currently unavailable (${status}). Will fallback to manual on-chain detection.`;
      } else {
        message = `OpenSea API error: ${status} - ${responseData?.errors?.[0] ?? err.message}`;
      }

      logger.warn(`[DROP_MINT] Error: ${message}`);
      return {
        success: false,
        error: { code: errorCode, message, status },
      };
    }

    logger.error(`[DROP_MINT] Unexpected error: ${err instanceof Error ? err.message : 'Unknown'}`);
    return {
      success: false,
      error: {
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'Unexpected error',
        status: 0,
      },
    };
  }
}
