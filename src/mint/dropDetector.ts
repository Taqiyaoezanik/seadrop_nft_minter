import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface DropStage {
  uuid: string;
  stage_type: 'public_sale' | 'signed_presale' | 'allowlist_presale';
  label: string;
  price: string;
  price_currency_address: string;
  start_time: string;
  end_time: string;
  max_per_wallet: string;
}

export interface DropInfo {
  collection_slug: string;
  collection_name: string;
  chain: string;
  contract_address: string;
  drop_type: string;
  is_minting: boolean;
  image_url: string;
  opensea_url: string;
  active_stage: DropStage | null;
  next_stage: DropStage | null;
  stages: DropStage[];
  total_supply?: string;
  max_supply?: string;
}

export async function checkIfDrop(slug: string): Promise<DropInfo | null> {
  try {
    const url = `${config.opensea.baseUrl}/api/v2/drops/${slug}`;
    logger.info(`[DROP] Checking if ${slug} is a Drop collection`);

    const response = await axios.get<DropInfo>(url, {
      headers: {
        'x-api-key': config.opensea.apiKey,
        'Accept': 'application/json',
      },
      timeout: 5000,
    });

    logger.info(`[DROP] ${slug} is a Drop collection (${response.data.drop_type})`);
    return response.data;
  } catch (err) {
    if (err instanceof AxiosError) {
      if (err.response?.status === 404) {
        logger.info(`[DROP] ${slug} is not a Drop collection (404)`);
        return null;
      }
      logger.warn(`[DROP] Error checking Drop status: ${err.response?.status ?? err.message}`);
    }
    return null;
  }
}
