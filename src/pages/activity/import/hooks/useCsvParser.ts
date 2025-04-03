import { useState, useCallback, useMemo } from 'react';
import Papa, { ParseResult } from 'papaparse';
import { logger } from '@/adapters';
import { CsvRowData, CsvRowError } from '@/lib/types';

// Validation function remains similar, checks if headers exist and are not empty
export function validateHeaders(headers: string[]): boolean {
  // Check for minimum 3 columns and ensure no header is empty or just whitespace
  return headers.length >= 3 && !headers.some((header) => !header || header.trim() === '');
}

interface CsvParserState {
  // Detected headers from the CSV
  headers: string[];
  // Data parsed into objects, key is header, value is cell content
  data: CsvRowData[];
  // Row-level errors using our custom error type
  errors: CsvRowError[];
  // Indicates if the parsing process is ongoing
  isParsing: boolean;
  // The file currently selected by the user
  selectedFile: File | null;
  // Raw CSV data as a 2D array, used for display even when headers are invalid
  rawCsvLines: string[][];
}

// Initial state setup
const initialState: CsvParserState = {
  data: [],
  headers: [],
  errors: [],
  isParsing: false,
  selectedFile: null,
  rawCsvLines: [],
};

export function useCsvParser() {
  const [state, setState] = useState<CsvParserState>(initialState);

  // Resets the parser state to its initial configuration
  const resetParserStates = useCallback(() => {
    setState(initialState);
  }, []);

  // Parses the provided CSV file
  const parseCsvFile = useCallback(
    (file: File) => {
      // Reset state before starting a new parse operation
      setState((_) => ({
        ...initialState,
        selectedFile: file,
        isParsing: true,
      }));

      // First, parse the file as raw CSV (without headers) to get the raw lines
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (rawResults) => {
          const rawCsvLines = rawResults.data as string[][];

          // Store the raw lines immediately, regardless of header validity
          setState((prev) => ({
            ...prev,
            rawCsvLines,
          }));

          // Now parse with headers for structured data
          Papa.parse<Record<string, string>>(file, {
            header: true, // Papaparse detects and uses the first row as headers
            skipEmptyLines: true,
            complete: (results: ParseResult<Record<string, string>>) => {
              // Trim headers
              const headers = (results.meta.fields || []).map((header) => header.trim());

              // Add lineNumber to each row and trim all values
              const data = results.data.map((row, index) => {
                const trimmedRow = Object.entries(row).reduce(
                  (acc, [key, value]) => ({
                    ...acc,
                    [key.trim()]: typeof value === 'string' ? value.trim() : value,
                  }),
                  {},
                );

                return {
                  ...trimmedRow,
                  lineNumber: (index + 2).toString(), // +2 because index 0 is row 2 (after header)
                };
              }) as CsvRowData[];

              // Convert PapaParse errors to our custom CsvRowError type
              const parseErrors: CsvRowError[] = results.errors.map((error) => ({
                type: error.type,
                code: error.code,
                message: error.message,
                row: typeof error.row === 'number' ? error.row + 1 : 1, // Add 1 to convert from 0-based index to 1-based row number, default to 1 if undefined
                index: error.index,
              }));

              // Log and store any row-level parsing errors encountered
              if (parseErrors.length > 0) {
                logger.warn(
                  `CSV parsing encountered ${parseErrors.length} row errors: ${JSON.stringify(parseErrors)}`,
                );
                // Store these row errors in state
                setState((prev) => ({ ...prev, errors: parseErrors }));
              }

              // Validate the detected headers
              if (!validateHeaders(headers)) {
                let errorMsg =
                  'Invalid CSV header row. Please ensure the first row contains valid, non-empty column names.';
                // Provide a more specific error if the column count is the issue
                if (headers.length < 3) {
                  errorMsg = `Invalid CSV header row. Expected at least 3 columns, but found ${headers.length}.`;
                } else if (headers.some((header) => !header || header.trim() === '')) {
                  errorMsg =
                    'Invalid CSV header row. One or more column names are empty or contain only whitespace.';
                }
                logger.error(errorMsg, { file: file.name });

                // Create a custom error and add it to row errors
                const headerError: CsvRowError = {
                  type: 'FieldMismatch',
                  code: 'TooFewFields',
                  message: errorMsg,
                  row: 0,
                };

                setState((prev) => ({
                  ...prev,
                  headers: headers, // Store potentially invalid headers for context
                  data: [], // No valid data if headers are invalid
                  isParsing: false,
                  errors: [headerError], // Only include header error - clear all other errors
                  // Keeping rawCsvLines from previous setState
                }));
                return; // Stop processing
              }

              // Check if data (excluding header) was actually parsed
              if (data.length === 0 && parseErrors.length === 0) {
                // Also check if there weren't row errors causing emptiness
                const errorMsg = 'The CSV file appears to be empty or contains only a header row.';
                logger.warn(errorMsg, { file: file.name });

                // Create an empty data error
                const emptyDataError: CsvRowError = {
                  type: 'FieldMismatch',
                  code: 'TooFewFields',
                  message: errorMsg,
                  row: 0,
                };

                setState((prev) => ({
                  ...prev,
                  headers: headers, // Headers might be valid, but no data
                  data: [],
                  isParsing: false,
                  errors: [emptyDataError], // Add empty data error to row errors
                  // Keeping rawCsvLines from previous setState
                }));
                return;
              }

              // Successful parse (or parse with row errors but valid headers/structure)
              setState((prev) => ({
                ...prev,
                data: data,
                headers: headers,
                isParsing: false,
                // errors are already set if they existed
                // Keeping rawCsvLines from previous setState
              }));
            },
            error: (error: Error) => {
              // Handle file-level parsing errors (e.g., file not readable)
              const errorMessage = `Error parsing CSV file: ${error.message}`;
              logger.error(errorMessage, { file: file.name });

              // Create a file-level error
              const fileError: CsvRowError = {
                type: 'FieldMismatch',
                code: 'TooFewFields',
                message: errorMessage,
                row: 0,
              };

              setState((prev) => ({
                ...initialState, // Reset most state on critical file error
                selectedFile: prev.selectedFile, // Keep the selected file for context
                isParsing: false,
                errors: [fileError], // Add file error to row errors
                rawCsvLines: prev.rawCsvLines, // Keep any raw data we might have
              }));
            },
          });
        },
        error: (error: Error) => {
          // Handle raw parsing errors
          const errorMessage = `Error parsing raw CSV file: ${error.message}`;
          logger.error(errorMessage, { file: file.name });

          // Create a file-level error
          const fileError: CsvRowError = {
            type: 'FieldMismatch',
            code: 'TooFewFields',
            message: errorMessage,
            row: 0,
          };

          setState((prev) => ({
            ...initialState,
            selectedFile: prev.selectedFile,
            isParsing: false,
            errors: [fileError],
          }));
        },
      });
    },
    [resetParserStates], // resetParserStates dependency is correct
  );

  // Convert the parsed data to a 2D string array format needed by other components
  // This is a fallback if rawCsvLines is not available
  const processedCsvData = useMemo(() => {
    if (!state.data || state.data.length === 0) return [];

    // Create header row
    const result: string[][] = [state.headers];

    // Convert each row object to an array of values in the same order as headers
    state.data.forEach((row) => {
      const rowValues: string[] = state.headers.map((header) =>
        row[header] !== undefined ? String(row[header]) : '',
      );
      result.push(rowValues);
    });

    return result;
  }, [state.data, state.headers]);

  
  // Prepare errors for display format
  // If there's a header error (row 0), only show that and suppress other errors
  const displayErrors = useMemo(() => {
    const hasHeaderError = state.errors.some((error) => error.row === 0);
    if (hasHeaderError) {
      return state.errors.filter((error) => error.row === 0);
    }
    return state.errors;
  }, [state.errors]);

  return {
    // Provide the parsed data (array of objects)
    data: state.data,
    // Provide the detected headers
    headers: state.headers,
    // Provide row-level errors from Papaparse (now includes parsing errors)
    // Filter to only show header errors if headers are invalid
    errors: displayErrors,
    // Indicate if parsing is in progress
    isParsing: state.isParsing,
    // Provide the currently selected file
    selectedFile: state.selectedFile,
    // Provide the 2D string array format of the CSV data
    // This will contain data even when headers are invalid
    rawData: state.rawCsvLines,
    // Function to initiate parsing
    parseCsvFile,
    // Function to reset the state
    resetParserStates,
  };
}
