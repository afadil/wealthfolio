import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import type { NewEvent, UpdateEvent } from "@/lib/types";
import { createEvent, updateEvent, deleteEvent } from "@/commands/event";
import { toast } from "@/components/ui/use-toast";

export const useEventMutations = () => {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (event: NewEvent) => createEvent(event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENTS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENTS_WITH_NAMES] });
      toast({
        title: "Success",
        description: "Event created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateEvent }) => updateEvent(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENTS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENTS_WITH_NAMES] });
      toast({
        title: "Success",
        description: "Event updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENTS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENTS_WITH_NAMES] });
      toast({
        title: "Success",
        description: "Event deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
};
