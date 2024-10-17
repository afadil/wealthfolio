import { invoke } from '@tauri-apps/api/core';
import { CsvImportProfile } from '@/lib/types';

export const getCsvImportProfiles = async (): Promise<CsvImportProfile[]> => {
  return invoke('get_csv_import_profiles', {});
};