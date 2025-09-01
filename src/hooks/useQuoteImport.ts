import { useState, useCallback } from 'react';
import { invokeTauri } from '../adapters';
import {
  QuoteImport,
  QuoteImportPreview,
  QuoteImportState,
  QuoteImportActions,
} from '../lib/types/quote-import';
import { parseCsvContent, validateCsvFile } from '../lib/quote-import-utils';

export function useQuoteImport(): QuoteImportState & QuoteImportActions {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<QuoteImportPreview | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  const validateFile = useCallback(async () => {
    console.log('🔍 validateFile called with file:', file?.name);
    console.log('🔍 Current state - isValidating:', isValidating, 'preview:', !!preview, 'error:', error);
    
    if (!file) {
      console.error('❌ No file selected');
      setError('No file selected');
      return false;
    }

    if (isValidating) {
      console.log('⚠️ Already validating, skipping...');
      return false;
    }

    console.log('✅ Starting validation...');
    setIsValidating(true);
    setError(null);

    try {
      console.log('📁 Validating CSV file format...');
      // First validate the file format
      const validation = await validateCsvFile(file);
      console.log('✅ File validation result:', validation);
      if (!validation.isValid) {
        setError(validation.error || 'Invalid file format');
        return;
      }

      // Read file content
      console.log('📖 Reading file content...');
      const fileContent = await file.text();
      console.log('📄 File content length:', fileContent.length);
      
      const parsedQuotes = parseCsvContent(fileContent);
      console.log('🔢 Parsed quotes count:', parsedQuotes.length);
      console.log('🎯 First few parsed quotes:', parsedQuotes.slice(0, 3));

      if (parsedQuotes.length === 0) {
        setError('No valid quotes found in file');
        return;
      }

      // Validate all quotes but show only sample in preview
      const validQuotes = parsedQuotes.filter((q) => q.validationStatus === 'valid');
      const invalidQuotes = parsedQuotes.filter((q) => q.validationStatus !== 'valid');
      console.log(`✅ Valid quotes: ${validQuotes.length}, ❌ Invalid: ${invalidQuotes.length}`);

      const mockPreview: QuoteImportPreview = {
        totalRows: parsedQuotes.length,
        validRows: validQuotes.length,
        invalidRows: invalidQuotes.length,
        sampleQuotes: parsedQuotes.slice(0, 10), // Show sample in UI
        detectedColumns: {},
        duplicateCount: 0,
      };

      console.log('📋 Created preview:', mockPreview);
      setPreview(mockPreview);
      
      // Return success indicator for UI flow
      return true;
    } catch (err) {
      console.error('❌ validateFile error:', err);
      setError(err instanceof Error ? err.message : 'Failed to validate file');
    } finally {
      setIsValidating(false);
    }
  }, [file]);

  const importQuotes = useCallback(async () => {
    console.log('🚀 importQuotes called');
    console.log('📁 File:', file?.name);
    console.log('🔄 Overwrite existing:', overwriteExisting);
    
    if (!file) {
      console.error('❌ No file selected');
      setError('No file selected');
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setError(null);

    try {
      console.log('📖 Reading file content for import...');
      // Read and parse ALL quotes from file, not just samples
      const fileContent = await file.text();
      const allQuotes = parseCsvContent(fileContent);
      console.log(`📊 Parsed ${allQuotes.length} quotes for import`);
      console.log('🎯 Sample quotes to import:', allQuotes.slice(0, 3));

      if (allQuotes.length === 0) {
        console.error('❌ No valid quotes found');
        setError('No valid quotes found in file');
        return;
      }

      console.log('⏳ Setting progress to 25%');
      setImportProgress(25);

      console.log('🔧 Calling Tauri command: import_quotes_csv');
      console.log('📦 Command payload:', {
        quotesCount: allQuotes.length,
        overwriteExisting,
        firstQuote: allQuotes[0],
      });

      const result = await invokeTauri<QuoteImport[]>('import_quotes_csv', {
        quotes: allQuotes, // Import ALL quotes, not just samples
        overwriteExisting,
      });

      console.log('✅ Tauri command completed successfully');
      console.log('📤 Import result:', result);
      console.log(`📊 Result count: ${result?.length || 0}`);

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
      
      console.log('🎉 Import process completed successfully');
    } catch (err) {
      console.error('❌ importQuotes error:', err);
      console.error('❌ Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
      });
      setError(err instanceof Error ? err.message : 'Failed to import quotes');
    } finally {
      console.log('🔄 Cleaning up import state');
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
