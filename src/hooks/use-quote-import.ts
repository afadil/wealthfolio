import { useCallback, useState } from "react";
import { invokeTauri } from "../adapters";
import { parseCsvContent, validateCsvFile } from "../lib/quote-import-utils";
import {
  QuoteImport,
  QuoteImportActions,
  QuoteImportPreview,
  QuoteImportState,
} from "../lib/types/quote-import";

export function useQuoteImport(): QuoteImportState & QuoteImportActions {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<QuoteImportPreview | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  const validateFile = useCallback(async () => {
    if (!file) {
      setError("No file selected");
      return false;
    }

    if (isValidating) {
      return false;
    }

    setIsValidating(true);
    setError(null);

    try {
      // First validate the file format
      const validation = await validateCsvFile(file);
      if (!validation.isValid) {
        setError(validation.error || "Invalid file format");
        return false;
      }

      // Read file content
      const fileContent = await file.text();

      const parsedQuotes = parseCsvContent(fileContent);

      if (parsedQuotes.length === 0) {
        setError("No valid quotes found in file");
        return false;
      }

      // Validate all quotes but show only sample in preview
      const validQuotes = parsedQuotes.filter((q) => q.validationStatus === "valid");
      const invalidQuotes = parsedQuotes.filter((q) => q.validationStatus !== "valid");

      const mockPreview: QuoteImportPreview = {
        totalRows: parsedQuotes.length,
        validRows: validQuotes.length,
        invalidRows: invalidQuotes.length,
        sampleQuotes: parsedQuotes.slice(0, 10), // Show sample in UI
        detectedColumns: {},
        duplicateCount: 0,
      };

      setPreview(mockPreview);

      // Return success indicator for UI flow
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate file");
      return false;
    } finally {
      setIsValidating(false);
    }
  }, [file]);

  const importQuotes = useCallback(async () => {
    if (!file) {
      console.error("❌ No file selected");
      setError("No file selected");
      return false;
    }

    setIsImporting(true);
    setImportProgress(0);
    setError(null);

    try {
      // Read and parse ALL quotes from file, not just samples
      const fileContent = await file.text();
      const allQuotes = parseCsvContent(fileContent);
      if (allQuotes.length === 0) {
        console.error("❌ No valid quotes found");
        setError("No valid quotes found in file");

        return false;
      }

      setImportProgress(25);

      // Simulate progress during import since Tauri command doesn't provide updates
      const progressInterval = setInterval(() => {
        setImportProgress((prev) => {
          const newProgress = prev + Math.random() * 10; // Random increment for realism
          return Math.min(newProgress, 90); // Don't go over 90% until actually complete
        });
      }, 200);

      const result = await invokeTauri<QuoteImport[]>("import_quotes_csv", {
        quotes: allQuotes, // Import ALL quotes, not just samples
        overwriteExisting,
      });

      clearInterval(progressInterval);

      setImportProgress(100);

      // Update preview with import results
      setPreview((prev) =>
        prev
          ? {
              ...prev,
              sampleQuotes: result,
            }
          : null,
      );

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import quotes");
      return false;
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  }, [file, overwriteExisting]);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setIsValidating(false);
    setIsImporting(false);
    setImportProgress(0);
    setError(null);
    setOverwriteExisting(false);
  }, []);

  return {
    // State
    file,
    preview,
    isValidating,
    isImporting,
    importProgress,
    error,
    overwriteExisting,

    // Actions
    setFile,
    validateFile,
    importQuotes,
    setOverwriteExisting,
    reset,
  };
}
