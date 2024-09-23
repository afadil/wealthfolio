import { AssetData, QuoteSummary } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';

export const searchTicker = async (query: string): Promise<QuoteSummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('search_symbol', { query });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error searching for ticker:', error);
    throw error;
  }
};

export const syncHistoryQuotes = async (): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri('synch_quotes');
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error syncing history quotes:', error);
    throw error;
  }
};

export const getAssetData = async (assetId: string): Promise<AssetData> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_asset_data', { assetId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error loading asset data:', error);
    throw error;
  }
};
