import { invoke } from '@tauri-apps/api';
import { AssetData, QuoteSummary } from '@/lib/types';

export const searchTicker = async (query: string): Promise<QuoteSummary[]> => {
  try {
    const searchResult = await invoke('search_ticker', { query });
    return searchResult as QuoteSummary[];
  } catch (error) {
    console.error('Error searching for ticker:', error);
    throw error;
  }
};

export const syncHistoryQuotes = async (): Promise<any> => {
  try {
    const result = await invoke('synch_quotes');
    return result;
  } catch (error) {
    console.error('Error syncing history quotes:', error);
    throw error;
  }
};

export const getAssetData = async (assetId: string): Promise<AssetData> => {
  try {
    const result = await invoke('get_asset_data', { assetId });
    return result as AssetData;
  } catch (error) {
    console.error('Error loading asset data:', error);
    throw error;
  }
};
