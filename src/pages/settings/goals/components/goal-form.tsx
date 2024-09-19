import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

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

import { newGoalSchema } from '@/lib/schemas';
import { useGoalMutations } from '@/pages/settings/goals/useGoalMutations';

type NewGoal = z.infer<typeof newGoalSchema>;

interface GoalFormlProps {
  defaultValues?: NewGoal;
  onSuccess?: () => void;
}

export function GoalForm({ defaultValues, onSuccess = () => {} }: GoalFormlProps) {
  const { addGoalMutation, updateGoalMutation } = useGoalMutations();

  const form = useForm<NewGoal>({
    resolver: zodResolver(newGoalSchema),
    defaultValues,
  });

  function onSubmit(data: NewGoal) {
    const { id, ...rest } = data;
    if (id) {
      return updateGoalMutation.mutate({ id, ...rest }, { onSuccess });
    }
    return addGoalMutation.mutate(data, { onSuccess });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle> {defaultValues?.id ? 'Update Goal' : 'Add Goal'}</DialogTitle>
          <DialogDescription>
            {defaultValues?.id ? 'Update goal information' : ' Add an investment goal to track.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          {/* add input hidden for id */}
          <input type="hidden" name="id" />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Goal Name</FormLabel>
                <FormControl>
                  <Input placeholder="Goal display title" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Goal description</FormLabel>
                <FormControl>
                  <Input placeholder="Goal short description" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="targetAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target amount</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="decimal" placeholder="Target amount" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {defaultValues?.id ? (
            <FormField
              control={form.control}
              name="isAchieved"
              render={({ field }) => (
                <FormItem className="flex items-center">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="space-y-0 pl-2"> Goal Achieved</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>
        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline">Cancel</Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span className="hidden sm:ml-2 sm:inline">
              {defaultValues?.id ? 'Update Goal' : 'Add Goal'}
            </span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
