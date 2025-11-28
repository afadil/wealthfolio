import { useState, useEffect } from 'react';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@wealthfolio/ui';
import type { EventType, NewEventType } from '@/lib/types';
import { useEventTypeMutations } from '../use-event-type-mutations';

const eventTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  color: z.string().optional(),
});

type EventTypeFormValues = z.infer<typeof eventTypeSchema>;

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#6b7280", // gray
];

interface EventTypeFormDialogProps {
  eventType?: EventType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventTypeFormDialog({ eventType, open, onOpenChange }: EventTypeFormDialogProps) {
  const { createMutation, updateMutation } = useEventTypeMutations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!eventType;

  const form = useForm<EventTypeFormValues>({
    resolver: zodResolver(eventTypeSchema),
    defaultValues: {
      name: eventType?.name || '',
      color: eventType?.color || PRESET_COLORS[0],
    },
  });

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      form.reset({
        name: eventType?.name || '',
        color: eventType?.color || PRESET_COLORS[0],
      });
    }
  }, [open, eventType, form]);

  const handleSubmit = async (values: EventTypeFormValues) => {
    setIsSubmitting(true);
    try {
      if (isEditing && eventType) {
        await updateMutation.mutateAsync({
          id: eventType.id,
          update: {
            name: values.name,
            color: values.color,
          },
        });
      } else {
        const newEventType: NewEventType = {
          name: values.name,
          color: values.color,
        };
        await createMutation.mutateAsync(newEventType);
      }
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save event type:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Event Type' : 'Create Event Type'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the event type name and color.'
              : 'Create a new event type to categorize events.'}
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
                    <Input
                      placeholder="e.g., Travel, Holiday, Business"
                      autoFocus={false}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                            field.value === color
                              ? "border-foreground ring-2 ring-offset-2"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => field.onChange(color)}
                        />
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                {isSubmitting ? (isEditing ? 'Updating...' : 'Creating...') : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
