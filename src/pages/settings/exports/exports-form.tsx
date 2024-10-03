import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExportData } from '@/lib/export-utils';
import { toast } from '@/components/ui/use-toast';

const exportFormSchema = z.object({
  format: z.enum(['CSV', 'JSON', 'SQLite']),
  data: z.enum(['accounts', 'activities', 'goals', 'portfolio-history', 'all']),
});

type ExportFormValues = z.infer<typeof exportFormSchema>;

export function ExportForm() {
  const { exportData } = useExportData();
  const form = useForm<ExportFormValues>({
    resolver: zodResolver(exportFormSchema),
    defaultValues: {
      format: 'CSV',
      data: 'all',
    },
  });

  const handleOnSuccess = () => {
    toast({
      title: 'File saved successfully.',
      className: 'bg-green-500 text-white border-none',
    });
  };

  const handleOnError = () => {
    toast({
      title: 'Something went wrong.',
      className: 'bg-red-500 text-white border-none',
    });
  };

  const onSubmit = async (data: ExportFormValues) => {
    exportData({
      params: data,
      onSuccess: handleOnSuccess,
      onError: handleOnError,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="format"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Format</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CSV">CSV</SelectItem>
                    <SelectItem value="JSON">JSON</SelectItem>
                    <SelectItem value="SQLite">SQLite</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.watch('format') !== 'SQLite' && (
          <FormField
            control={form.control}
            name="data"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select data" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accounts">Accounts</SelectItem>
                      <SelectItem value="activities">Activities</SelectItem>
                      <SelectItem value="goals">Goals</SelectItem>
                      <SelectItem value="portfolio-history">Portfolio History</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <Button type="submit">Export</Button>
      </form>
    </Form>
  );
}
