import { useState, useCallback, useMemo } from "react";
import Papa, { ParseResult } from "papaparse";
import { logger } from "@/adapters";
import { CsvRowData, CsvRowError } from "@/lib/types";

// Validation function remains similar, checks if headers exist and are not empty
export function validateHeaders(headers: string[]): boolean {
  // Check for minimum 3 columns and ensure no header is empty or just whitespace
  return headers.length >= 3 && !headers.some((header) => !header || header.trim() === "");
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

      // Parse the file as raw CSV (without headers)
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results: ParseResult<string[]>) => {
          const rawCsvLines = results.data; // Keep as string[][]

          // Store the raw lines immediately
          setState((prev) => ({
            ...prev,
            rawCsvLines,
          }));

          // Check if we have at least a header row
          if (rawCsvLines.length === 0) {
            const errorMsg = "The CSV file appears to be empty.";
            logger.warn(errorMsg, { file: file.name });
            const emptyFileError: CsvRowError = {
              type: "FieldMismatch",
              code: "MissingQuotes", // Using a relevant code, might need adjustment
              message: errorMsg,
              row: 0, // Indicate general file error
            };
            setState((prev) => ({
              ...prev,
              isParsing: false,
              errors: [emptyFileError],
            }));
            return;
          }

          // Extract and trim potential headers from the first row
          const headers = rawCsvLines[0].map((header) => header.trim());

          // Validate the detected headers
          if (!validateHeaders(headers)) {
            let errorMsg =
              "Invalid CSV header row. Please ensure the first row contains valid, non-empty column names.";
            if (headers.length < 3) {
              errorMsg = `Invalid CSV header row. Expected at least 3 columns, but found ${headers.length}.`;
            } else if (headers.some((header) => !header || header.trim() === "")) {
              errorMsg =
                "Invalid CSV header row. One or more column names are empty or contain only whitespace.";
            }
            logger.error(errorMsg, { file: file.name });

            const headerError: CsvRowError = {
              type: "FieldMismatch",
              code: "TooFewFields", // Or another appropriate code
              message: errorMsg,
              row: 0, // Header error
            };

            setState((prev) => ({
              ...prev,
              headers: headers, // Store invalid headers for context
              data: [],
              isParsing: false,
              errors: [headerError],
              // rawCsvLines is already set
            }));
            return; // Stop processing
          }

          // Process data rows (excluding the header row)
          const data: CsvRowData[] = [];
          const processingErrors: CsvRowError[] = []; // Collect potential errors during manual processing

          // Start from index 1 to skip header row
          for (let i = 1; i < rawCsvLines.length; i++) {
            const rawRow = rawCsvLines[i];
            const lineNumber = i + 1; // CSV line number (1-based)
            const rowData: CsvRowData = { lineNumber: lineNumber.toString() };

            // Check for row length mismatch (fewer fields than headers)
            if (rawRow.length < headers.length) {
              const message = `Row ${lineNumber}: Expected ${headers.length} fields but found ${rawRow.length}.`;
              logger.warn(message, { file: file.name });
              processingErrors.push({
                type: "FieldMismatch",
                code: "TooFewFields",
                message: message,
                // Use zero-based index within rawCsvLines so UI highlights the correct row
                row: i,
              });
              // Optionally skip this row or fill missing values
              // continue; // If skipping
            }

            // Build the row object using headers, trimming values
            // This loop inherently ignores extra fields in rawRow (if rawRow.length > headers.length)
            headers.forEach((header, index) => {
              const value = rawRow[index]; // Access value by index
              rowData[header] = typeof value === "string" ? value.trim() : (value ?? ""); // Handle undefined/null
            });

            data.push(rowData);
          }

          // Check if data (excluding header) was actually processed
          if (data.length === 0 && processingErrors.length === 0) {
            const errorMsg =
              "The CSV file contains only a header row or is empty after processing.";
            logger.warn(errorMsg, { file: file.name });

            const emptyDataError: CsvRowError = {
              type: "FieldMismatch",
              code: "TooFewFields", // Reusing code
              message: errorMsg,
              row: 0, // General data error indication
            };

            setState((prev) => ({
              ...prev,
              headers: headers, // Headers are valid
              data: [],
              isParsing: false,
              errors: [emptyDataError], // Only this error
              // rawCsvLines already set
            }));
            return;
          }

          // Successful processing (potentially with row errors)
          setState((prev) => ({
            ...prev,
            data: data,
            headers: headers,
            isParsing: false,
            errors: processingErrors, // Use errors found during manual processing
            // rawCsvLines already set
          }));
        },
        error: (error: Error) => {
          // Handle file-level parsing errors (e.g., file not readable)
          const errorMessage = `Error parsing CSV file: ${error.message}`;
          logger.error(errorMessage, { file: file.name });

          // Create a file-level error
          const fileError: CsvRowError = {
            type: "FieldMismatch", // Generic type
            code: "UndetectableDelimiter", // Or another relevant code
            message: errorMessage,
            row: 0, // Indicate general file error
          };

          setState((prev) => ({
            ...initialState, // Reset most state on critical file error
            selectedFile: prev.selectedFile, // Keep the selected file for context
            isParsing: false,
            errors: [fileError],
            rawCsvLines: prev.rawCsvLines, // Keep raw lines if any were read
          }));
        },
      });
    },
    [resetParserStates], // Keep resetParserStates dependency
  );

  // Prepare errors for display format
  // If there's a header error (row 0), only show that and suppress other errors
  const displayErrors = useMemo(() => {
    const headerOrFileError = state.errors.find((error) => error.row === 0);
    if (headerOrFileError) {
      return [headerOrFileError]; // Show only the first file/header level error
    }
    // Otherwise show all row-specific processing errors
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
