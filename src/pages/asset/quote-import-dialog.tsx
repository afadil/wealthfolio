import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@wealthfolio/ui';
import { Quote } from '@/lib/types';
import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';

interface QuoteImportDialogProps {
  onImport: (quotes: Quote[]) => void;
  symbol: string;
  currency: string;
}

export const QuoteImportDialog: React.FC<QuoteImportDialogProps> = ({ onImport, symbol, currency }) => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        complete: (results) => {
          const parsedQuotes = results.data.map((row: any) => ({
            id: `${row.date}_${symbol}`,
            symbol,
            timestamp: new Date(row.date).toISOString(),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            adjclose: row.close,
            currency,
            data_source: 'MANUAL',
            created_at: new Date().toISOString(),
          }));
          setQuotes(parsedQuotes as Quote[]);
        },
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const handleImport = () => {
    onImport(quotes);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Import from file
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Import Quotes for {symbol}</DialogTitle>
        </DialogHeader>
        <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-md p-8 text-center cursor-pointer">
          <input {...getInputProps()} />
          {isDragActive ? (
            <p>Drop the files here ...</p>
          ) : (
            <p>Drag 'n' drop a CSV file here, or click to select files</p>
          )}
        </div>
        {quotes.length > 0 && (
          <div>
            <h3 className="text-lg font-medium my-4">Preview</h3>
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Open</TableHead>
                    <TableHead>High</TableHead>
                    <TableHead>Low</TableHead>
                    <TableHead>Close</TableHead>
                    <TableHead>Volume</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell>{new Date(quote.timestamp).toLocaleDateString()}</TableCell>
                      <TableCell>{quote.open}</TableCell>
                      <TableCell>{quote.high}</TableCell>
                      <TableCell>{quote.low}</TableCell>
                      <TableCell>{quote.close}</TableCell>
                      <TableCell>{quote.volume}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleImport}>Import</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
