import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import type { NewEventType, UpdateEventType } from '@/lib/types';
import { createEventType, updateEventType, deleteEventType } from '@/commands/event-type';
import { toast } from '@/components/ui/use-toast';

export const useEventTypeMutations = () => {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (eventType: NewEventType) => createEventType(eventType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENT_TYPES] });
      toast({
        title: 'Success',
        description: 'Event type created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateEventType }) =>
      updateEventType(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENT_TYPES] });
      toast({
        title: 'Success',
        description: 'Event type updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEventType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENT_TYPES] });
      toast({
        title: 'Success',
        description: 'Event type deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
};
