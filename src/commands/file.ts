import { open } from '@tauri-apps/api/dialog';

// openCsvFile
export const openCsvFileDialog = (): Promise<null | string | string[]> => {
  try {
    return open({ filters: [{ name: 'CSV', extensions: ['csv'] }] });
  } catch (error) {
    console.error('Error open csv file', error);
    throw error;
  }
};