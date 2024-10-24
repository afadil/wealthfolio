import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { ImportFormat } from '@/lib/types';
import { validateCsvStructure, initializeColumnMapping } from '../utils/csvValidation';

export function useCsvParser() {
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isValidCsv, setIsValidCsv] = useState(true);

  const resetFileStates = () => {
    setCsvData([]);
    setHeaders([]);
    setError(null);
    setIsLoading(false);
    setIsValidCsv(true);
    setValidationErrors({});
  };

  const parseCsvFile = useCallback((file: File, form: any) => {
    resetFileStates();
    setSelectedFile(file);

    Papa.parse(file, {
      complete: (results: Papa.ParseResult<string[]>) => {
        if (results.data && results.data.length > 0) {
          setCsvData(results.data);
          const headerRow = results.data[0].map((header) => header.trim());
          setHeaders(headerRow);

          const isValid = validateCsvStructure(headerRow);

          if (!isValid) {
            setIsValidCsv(false);
            setError(
              "Oops! The CSV file structure doesn't look quite right. Please make sure your file starts with a header row containing multiple column names.",
            );
          } else {
            const initialMapping = initializeColumnMapping(headerRow);
            form.setValue('mapping.columns', {
              ...form.getValues('mapping.columns'),
              ...initialMapping,
            } as Record<ImportFormat, string>);
          }
        } else {
          setIsValidCsv(false);
          setError('The CSV file appears to be empty.');
        }
        setIsLoading(false);
      },
      error: (error: any) => {
        setIsValidCsv(false);
        setError(`Error parsing CSV: ${error.message}`);
        setIsLoading(false);
      },
    });
  }, []);

  return {
    csvData,
    headers,
    error,
    validationErrors,
    isLoading,
    selectedFile,
    isValidCsv,
    parseCsvFile,
    resetFileStates,
    setValidationErrors,
    setSelectedFile,
  };
}
