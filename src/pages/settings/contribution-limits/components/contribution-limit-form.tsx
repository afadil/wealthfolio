import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { newContributionLimitSchema } from '@/lib/schemas';
import { useContributionLimitMutations } from '../useContributionLimitMutations';
import { MoneyInput } from '@/components/ui/money-input';
import { useTranslation } from 'react-i18next';

type NewContributionLimit = z.infer<typeof newContributionLimitSchema>;

interface ContributionLimitFormProps {
  defaultValues?: NewContributionLimit;
  onSuccess?: () => void;
}

export function ContributionLimitForm({
  defaultValues,
  onSuccess = () => {},
}: ContributionLimitFormProps) {
  const { t } = useTranslation();
  const { addContributionLimitMutation, updateContributionLimitMutation } =
    useContributionLimitMutations();

  const form = useForm<NewContributionLimit>({
    resolver: zodResolver(newContributionLimitSchema),
    defaultValues,
  });

  function onSubmit(data: NewContributionLimit) {
    const { id, ...rest } = data;
    if (id) {
      return updateContributionLimitMutation.mutate({ id, updatedLimit: rest }, { onSuccess });
    }
    return addContributionLimitMutation.mutate(data, { onSuccess });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle>
            {' '}
            {defaultValues?.id ? t('Update Contribution Limit') : t('Add Contribution Limit')}
          </DialogTitle>
          <DialogDescription>
            {defaultValues?.id
              ? t('Update contribution limit information')
              : t(' Add a new contribution limit.')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          <input type="hidden" name="id" />

          <FormField
            control={form.control}
            name="groupName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Group Name')}</FormLabel>
                <FormControl>
                  <Input placeholder={t("Group name")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contributionYear"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Contribution Year')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder={t("Contribution year")}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="limitAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Limit Amount')}</FormLabel>
                <FormControl>
                  <MoneyInput placeholder={t("Limit amount")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline">{t('Cancel')}</Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span className="hidden sm:ml-2 sm:inline">
              {defaultValues?.id ? t('Update Limit') : t('Add Limit')}
            </span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
