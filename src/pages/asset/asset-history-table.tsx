import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Quote } from '@/lib/types';
import { Icons } from '@/components/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AssetHistoryTableProps {
  data: Quote[];
  isManualDataSource: boolean;
  onSaveQuote?: (quote: Quote) => void;
  onDeleteQuote?: (id: string) => void;
}

export function AssetHistoryTable({
  data,
  isManualDataSource,
  onSaveQuote,
  onDeleteQuote,
}: AssetHistoryTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Partial<Quote> | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const handleEdit = (quote: Quote) => {
    setEditingId(quote.id);
    setEditedValues(quote);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditedValues(null);
  };

  const handleSave = () => {
    if (editingId && onSaveQuote && editedValues) {
      onSaveQuote(editedValues as Quote);
      setEditingId(null);
      setEditedValues(null);
    }
  };

  const handleInputChange = (field: keyof Quote, value: string) => {
    if (editedValues) {
      setEditedValues({
        ...editedValues,
        [field]: field === 'date' ? new Date(value) : Number(value),
      });
    }
  };

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentData = data.slice(startIndex, endIndex);
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Open</TableHead>
            <TableHead>High</TableHead>
            <TableHead>Low</TableHead>
            <TableHead>Close</TableHead>
            <TableHead>Volume</TableHead>
            {isManualDataSource && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {currentData.map((quote) => (
            <TableRow key={quote.id}>
              {editingId === quote.id ? (
                <>
                  <TableCell>
                    <Input
                      type="date"
                      value={format(editedValues?.date || quote.date, 'yyyy-MM-dd')}
                      onChange={(e) => handleInputChange('date', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={editedValues?.open || quote.open}
                      onChange={(e) => handleInputChange('open', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={editedValues?.high || quote.high}
                      onChange={(e) => handleInputChange('high', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={editedValues?.low || quote.low}
                      onChange={(e) => handleInputChange('low', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={editedValues?.close || quote.close}
                      onChange={(e) => handleInputChange('close', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={editedValues?.volume || quote.volume}
                      onChange={(e) => handleInputChange('volume', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button size="sm" onClick={handleSave}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancel}>
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>{format(quote.date, 'yyyy-MM-dd')}</TableCell>
                  <TableCell>{quote.open}</TableCell>
                  <TableCell>{quote.high}</TableCell>
                  <TableCell>{quote.low}</TableCell>
                  <TableCell>{quote.close}</TableCell>
                  <TableCell>{quote.volume}</TableCell>
                  {isManualDataSource && (
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(quote)}>
                          <Icons.Pencil className="h-4 w-4" />
                        </Button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <Icons.Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="grid gap-4">
                              <div className="space-y-2">
                                <h4 className="font-medium leading-none">Delete Quote</h4>
                                <p className="text-sm text-muted-foreground">
                                  Are you sure you want to delete this quote? This action cannot be
                                  undone.
                                </p>
                              </div>
                              <div className="flex justify-end space-x-2">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => onDeleteQuote?.(quote.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableCell>
                  )}
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex justify-center space-x-2">
          <Button
            variant="outline"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default AssetHistoryTable;
