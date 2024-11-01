import { AssetData, QuoteSummary, Asset } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { error as logError } from '@tauri-apps/plugin-log';
export const searchTicker = async (query: string): Promise<QuoteSummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('search_symbol', { query });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error searching for ticker.');
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
    logError('Error syncing history quotes.');
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
    logError('Error loading asset data.');
    throw error;
  }
};

export const updateAssetProfile = async (payload: {
  symbol: string;
  sectors: string;
  countries: string;
  comment: string;
  assetSubClass: string;
}): Promise<Asset> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_asset_profile', { id: payload.symbol, payload });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error updating asset profile.');
    throw error;
  }
};
