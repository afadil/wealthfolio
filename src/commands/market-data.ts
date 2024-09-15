import { invoke } from '@tauri-apps/api';
import { AssetData, QuoteSummary } from '@/lib/types';

export const searchTicker = async (query: string): Promise<QuoteSummary[]> => {
  try {
    const searchResult = await invoke('search_symbol', { query });
    return searchResult as QuoteSummary[];
  } catch (error) {
    console.error('Error searching for ticker:', error);
    throw error;
  }
};

export const syncHistoryQuotes = async (): Promise<void> => {
  try {
    await invoke('synch_quotes');
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
