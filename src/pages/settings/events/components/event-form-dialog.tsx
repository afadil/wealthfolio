import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Switch,
  DatePickerInput,
} from '@wealthfolio/ui';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { EventType, NewEvent, EventWithTypeName } from '@/lib/types';
import { useEventMutations } from '../use-event-mutations';
import { useEffect } from 'react';

const eventSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  eventTypeId: z.string().min(1, 'Event type is required'),
  startDate: z.date({ required_error: 'Start date is required' }),
  endDate: z.date({ required_error: 'End date is required' }),
  isDynamicRange: z.boolean(),
}).refine((data) => {
  // Only validate date order if not using dynamic range
  if (!data.isDynamicRange) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: 'Start date must be before or equal to end date',
  path: ['endDate'],
});

type EventFormValues = z.infer<typeof eventSchema>;

interface EventFormDialogProps {
  eventTypes: EventType[];
  event?: EventWithTypeName;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEventTypeId?: string;
}

export function EventFormDialog({ eventTypes, event, open, onOpenChange, defaultEventTypeId }: EventFormDialogProps) {
  const { createMutation, updateMutation } = useEventMutations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!event;

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema) as never,
    defaultValues: {
      name: '',
      description: '',
      eventTypeId: '',
      startDate: new Date(),
      endDate: new Date(),
      isDynamicRange: false,
    },
  });

  // Watch the isDynamicRange field to conditionally show/hide date pickers
  const isDynamicRange = form.watch('isDynamicRange');

  // Reset form when dialog opens with event data
  useEffect(() => {
    if (open) {
      if (event) {
        form.reset({
          name: event.name,
          description: event.description || '',
          eventTypeId: event.eventTypeId,
          startDate: new Date(event.startDate),
          endDate: new Date(event.endDate),
          isDynamicRange: event.isDynamicRange,
        });
      } else {
        form.reset({
          name: '',
          description: '',
          eventTypeId: defaultEventTypeId || '',
          startDate: new Date(),
          endDate: new Date(),
          isDynamicRange: false,
        });
      }
    }
  }, [open, event, form, defaultEventTypeId]);

  const handleSubmit = async (values: EventFormValues) => {
    setIsSubmitting(true);
    try {
      // Convert Date objects to ISO date strings (YYYY-MM-DD)
      const startDateStr = values.startDate.toISOString().split('T')[0];
      const endDateStr = values.endDate.toISOString().split('T')[0];

      if (isEditing && event) {
        await updateMutation.mutateAsync({
          id: event.id,
          update: {
            name: values.name,
            description: values.description || undefined,
            eventTypeId: values.eventTypeId,
            startDate: startDateStr,
            endDate: endDateStr,
            isDynamicRange: values.isDynamicRange,
          },
        });
      } else {
        const newEvent: NewEvent = {
          name: values.name,
          description: values.description || undefined,
          eventTypeId: values.eventTypeId,
          startDate: startDateStr,
          endDate: endDateStr,
          isDynamicRange: values.isDynamicRange,
        };
        await createMutation.mutateAsync(newEvent);
      }
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} event:`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Event' : 'Create Event'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the event details.'
              : 'Create a new event to track and categorize cash account transactions.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Summer Vacation 2024" {...field} />
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
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add details about this event..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="eventTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select event type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {eventTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDynamicRange"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Dynamic Date Range</FormLabel>
                    <FormDescription className="text-xs">
                      {field.value
                        ? 'Dates will automatically adjust based on linked transactions'
                        : 'Set fixed dates that won\'t change when transactions are added'}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {!isDynamicRange && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <DatePickerInput
                        onChange={(date: Date | undefined) => field.onChange(date)}
                        value={field.value}
                        disabled={field.disabled}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <DatePickerInput
                        onChange={(date: Date | undefined) => field.onChange(date)}
                        value={field.value}
                        disabled={field.disabled}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? isEditing
                    ? 'Updating...'
                    : 'Creating...'
                  : isEditing
                    ? 'Update Event'
                    : 'Create Event'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
