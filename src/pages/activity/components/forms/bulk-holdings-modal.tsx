import { useForm, FormProvider, type Resolver, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Form,
} from '@wealthfolio/ui';
import { toast } from '@/components/ui/use-toast';
import { BulkHoldingsForm } from './bulk-holdings-form';
import { bulkHoldingsFormSchema } from './schemas';
import { useActivityImportMutations } from '../../import/hooks/use-activity-import-mutations';
import { ActivityImport, Account } from '@/lib/types';
import { ActivityType } from '@/lib/constants';
import { z } from 'zod';

type BulkHoldingsFormValues = z.infer<typeof bulkHoldingsFormSchema>;

interface BulkHoldingsModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BulkHoldingsModal = ({ open, onClose, onSuccess }: BulkHoldingsModalProps) => {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  
  const form = useForm<BulkHoldingsFormValues>({
    resolver: zodResolver(bulkHoldingsFormSchema) as Resolver<BulkHoldingsFormValues>,
    mode: 'onSubmit',
    defaultValues: {
      accountId: '',
      activityDate: new Date(),
      currency: 'USD',
      isDraft: false,
      comment: '',
      holdings: [
        {
          id: '1',
          ticker: '',
          name: '',
          assetId: '',
        },
      ],
    },
  });

  // Watch holdings for UI state management
  const watchedHoldings = form.watch('holdings');
  const hasValidHoldings = watchedHoldings?.some(holding => 
    holding.ticker && 
    Number(holding.sharesOwned) > 0 && 
    Number(holding.averageCost) > 0
  ) || false;

  // Reset form when modal is closed and handle initial focus
  useEffect(() => {
    if (!open) {
      form.reset();
      setSelectedAccount(null);
    } else {
      // When modal opens, focus the account field with proper timing
      // Use a longer delay to ensure modal is fully rendered
      const timeoutId = setTimeout(() => {
        form.setFocus('accountId');
      }, 150);

      return () => clearTimeout(timeoutId);
    }
  }, [open, form]);

  // Account change handler
  const handleAccountChange = useCallback((account: Account | null) => {
    setSelectedAccount(account);
    form.setValue('accountId', account?.id || '', {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [form]);

  const { confirmImportMutation } = useActivityImportMutations({
    onSuccess: () => {
      toast({
        title: 'Import successful',
        description: 'Holdings have been imported successfully.',
        variant: 'default',
      });
      form.reset();
      setSelectedAccount(null);
      onSuccess?.();
      onClose();
    }
  });

  const handleSubmit: SubmitHandler<BulkHoldingsFormValues> = useCallback((data) => {
    // Validate holdings data
    const validHoldings = data.holdings.filter(holding => 
      holding.ticker?.trim() && 
      Number(holding.sharesOwned) > 0 && 
      Number(holding.averageCost) > 0
    );
    
    if (!validHoldings.length) {
      toast({
        title: 'No valid holdings',
        description: 'Please add at least one valid holding with ticker, shares, and average cost.',
        variant: 'destructive',
      });
      return;
    }

    // Transform to ActivityImport format
    const activitiesToImport: ActivityImport[] = validHoldings.map(holding => ({
      accountId: data.accountId,
      activityType: ActivityType.ADD_HOLDING,
      symbol: holding.ticker.toUpperCase().trim(),
      quantity: Number(holding.sharesOwned),
      unitPrice: Number(holding.averageCost),
      date: data.activityDate,
      currency: data.currency || selectedAccount?.currency || 'USD',
      fee: 0,
      isDraft: false,
      isValid: true,
      comment: data.comment || `Bulk import - ${validHoldings.length} holdings`,
    }));

    confirmImportMutation.mutate({ activities: activitiesToImport });
  }, [confirmImportMutation, selectedAccount]);

  const handleFormError = useCallback((errors: Record<string, any>) => {
    // Get the first error message to display
    const firstError = Object.values(errors)[0];
    const errorMessage = firstError?.message || 'Please check the form for errors.';
    
    toast({
      title: 'Form validation failed',
      description: errorMessage,
      variant: 'destructive',
    });
  }, []);

  const isSubmitDisabled = confirmImportMutation.isPending || 
                          !hasValidHoldings || 
                          !selectedAccount ||
                          !form.formState.isValid;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Portfolio</DialogTitle>
          <DialogDescription>
            Quickly add multiple holdings to your portfolio. Enter your current positions with ticker symbols, quantities, and average costs.
          </DialogDescription>
        </DialogHeader>

        <FormProvider {...form}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit, handleFormError)} className="space-y-6">
              <div className="py-4">
                <BulkHoldingsForm 
                  onAccountChange={handleAccountChange}
                />
              </div>

              {/* Display validation errors */}
              {Object.keys(form.formState.errors).length > 0 && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <h4 className="text-sm font-medium text-destructive mb-2">Please fix the following errors:</h4>
                  <ul className="text-sm text-destructive/80 space-y-1">
                    {form.formState.errors.accountId && (
                      <li>• {form.formState.errors.accountId.message}</li>
                    )}
                    {form.formState.errors.activityDate && (
                      <li>• {form.formState.errors.activityDate.message}</li>
                    )}
                    {form.formState.errors.holdings && (
                      <li>• {form.formState.errors.holdings.message}</li>
                    )}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitDisabled}
                >
                  {confirmImportMutation.isPending ? 'Importing...' : 'Confirm'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};
