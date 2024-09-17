import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Link } from 'react-router-dom';

import { EmptyPlaceholder } from '@/components/empty-placeholder';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { Account, ActivityImport } from '@/lib/types';
import { getAccounts } from '@/commands/account';
import { useMutation, useQuery } from '@tanstack/react-query';
import { checkActivitiesImport } from '@/commands/activity';
import {
  listenImportFileDrop,
  listenImportFileDropCancelled,
  listenImportFileDropHover,
  UnlistenFn,
} from '@/commands/import-listener';
import { openCsvFileDialog } from '@/commands/file';
import { QueryKeys } from '@/lib/query-keys';

const importFormSchema = z.object({
  account_id: z.string({ required_error: 'Please select an account.' }),
  file_path: z.string({ required_error: 'Please select a file.' }),
});
type ImportFormInputs = z.infer<typeof importFormSchema>;

type ActivityImportFormProps = {
  onSuccess: (activities: ActivityImport[]) => void;
  onError: (error: string) => void;
};

export const ActivityImportForm = ({ onSuccess, onError }: ActivityImportFormProps) => {
  const { data: accounts } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });
  const [dragging, setDragging] = useState<boolean>(false);

  useEffect(() => {
    const unlistenHover = listenImportFileDropHover<string>(() => setDragging(true));
    const unlistenDrop = listenImportFileDrop<string>(() => setDragging(false));
    const unlistenCancelled = listenImportFileDropCancelled<string>(() => setDragging(false));

    return () => {
      unlistenHover;
      unlistenDrop;
      unlistenCancelled;
    };
  }, []);

  const activeAccounts = accounts?.filter((account) => account.isActive);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      //tauri://file-drop and tauri://file-drop-hover (and tauri://file-drop-cancelled)
      unlisten = await listenImportFileDrop<string[]>((event) => {
        if (event.payload) {
          setDragging(false);
          form.setValue('file_path', event.payload[0] as string);
        }
      });
    })();
    return () => {
      (async () => {
        if (unlisten !== null) {
          unlisten();
        }
      })();
    };
  }, []);

  const checkImportMutation = useMutation({
    mutationFn: checkActivitiesImport,
    onSuccess: (data) => {
      onSuccess(data);
    },
    onError: (error: any) => {
      onError(error);
    },
  });

  const form = useForm<ImportFormInputs>({
    resolver: zodResolver(importFormSchema),
  });

  const openFilePicker = async () => {
    let filepath = await openCsvFileDialog();
    form.setValue('file_path', filepath as string);
  };

  async function onSubmit(data: ImportFormInputs) {
    await checkImportMutation.mutateAsync({
      account_id: data.account_id,
      file_path: data.file_path,
    });
  }

  const selectedFilePath = form.watch('file_path') as string | null;

  const dropZoneClasses = `relative border cursor-pointer  ${
    dragging ? 'border-blue-300 bg-blue-100' : 'border-gray-300'
  }`;

  const isLoading = checkImportMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 lg:max-w-4xl">
        <FormField
          control={form.control}
          name="account_id"
          render={({ field }) => (
            <FormItem className={isLoading ? 'pointer-events-none opacity-50' : ''}>
              <FormLabel>Account</FormLabel>
              <FormControl>
                <Select
                  disabled={checkImportMutation.isPending}
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts?.map((account) => (
                      <SelectItem value={account.id} key={account.id}>
                        {account.name} ({account.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="file_path"
          render={() => (
            <FormItem className={isLoading ? 'pointer-events-none opacity-40' : ''}>
              <FormLabel>File</FormLabel>
              <FormControl>
                <EmptyPlaceholder className={dropZoneClasses} onClick={openFilePicker}>
                  {selectedFilePath ? (
                    <>
                      {isLoading ? (
                        <EmptyPlaceholder.Icon name="Spinner" className="animate-spin" />
                      ) : (
                        <EmptyPlaceholder.Icon name="FileText" />
                      )}
                      <EmptyPlaceholder.Title>
                        {selectedFilePath?.split('/').pop()}
                      </EmptyPlaceholder.Title>
                      <EmptyPlaceholder.Description>
                        {/* {(selectedFile?.size / 1024).toFixed(2)} KB */}
                        {checkImportMutation.isPending ? (
                          <div className="relative h-2 w-full min-w-[200px] rounded-full bg-gray-200">
                            <div
                              className="absolute left-0 h-2 animate-pulse rounded-full bg-gray-800"
                              style={{ width: '40%' }}
                            ></div>
                          </div>
                        ) : null}
                      </EmptyPlaceholder.Description>
                    </>
                  ) : (
                    <>
                      <EmptyPlaceholder.Icon name="Import" />
                      <EmptyPlaceholder.Title>
                        Drag and drop your CSV file here
                      </EmptyPlaceholder.Title>
                      <EmptyPlaceholder.Description>
                        Or click the button below to choose a file.
                      </EmptyPlaceholder.Description>
                    </>
                  )}
                  <Input type="hidden" />
                </EmptyPlaceholder>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex space-x-4">
          <Button type="button" variant="outline" asChild>
            <Link to="/activities">
              {/* <Icons.ArrowLeft className="mr-2 h-4 w-4" /> */}
              <span className="hidden sm:ml-2 sm:inline">Cancel</span>
            </Link>
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                <span className="hidden sm:ml-2 sm:inline">Validating activities...</span>
              </>
            ) : (
              <>
                <Icons.Import className="mr-2 h-4 w-4" />
                <span className="hidden sm:ml-2 sm:inline">Import activities</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
};
