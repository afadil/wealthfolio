import { getEventsWithNames } from "@/commands/event";
import { getEventTypes } from "@/commands/event-type";
import { QueryKeys } from "@/lib/query-keys";
import type { EventType, EventWithTypeName } from "@/lib/types";
import { EventFormDialog } from "@/pages/settings/events/components/event-form-dialog";
import { EventTypeFormDialog } from "@/pages/settings/events/components/event-type-form-dialog";
import { useEventMutations } from "@/pages/settings/events/use-event-mutations";
import { useEventTypeMutations } from "@/pages/settings/events/use-event-type-mutations";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
  ScrollArea,
  Skeleton,
} from "@wealthfolio/ui";
import { useState } from "react";

interface ManageEventsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ManageEventsDialog({ open, onClose }: ManageEventsDialogProps) {
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: [QueryKeys.EVENTS_WITH_NAMES],
    queryFn: getEventsWithNames,
    enabled: open,
  });

  const { data: eventTypes, isLoading: typesLoading } = useQuery({
    queryKey: [QueryKeys.EVENT_TYPES],
    queryFn: getEventTypes,
    enabled: open,
  });

  const { deleteMutation: deleteEventTypeMutation } = useEventTypeMutations();
  const { deleteMutation: deleteEventMutation } = useEventMutations();

  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isEventTypeDialogOpen, setIsEventTypeDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventWithTypeName | undefined>();
  const [selectedEventType, setSelectedEventType] = useState<EventType | undefined>();
  const [selectedEventTypeForNewEvent, setSelectedEventTypeForNewEvent] = useState<
    EventType | undefined
  >();
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const isLoading = eventsLoading || typesLoading;

  const eventsByType = (events || []).reduce(
    (acc, event) => {
      if (!acc[event.eventTypeId]) {
        acc[event.eventTypeId] = [];
      }
      acc[event.eventTypeId].push(event);
      return acc;
    },
    {} as Record<string, EventWithTypeName[]>,
  );

  const toggleExpanded = (typeId: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) {
        next.delete(typeId);
      } else {
        next.add(typeId);
      }
      return next;
    });
  };

  const handleAddEventType = () => {
    setSelectedEventType(undefined);
    setIsEventTypeDialogOpen(true);
  };

  const handleEditEventType = (eventType: EventType) => {
    setSelectedEventType(eventType);
    setIsEventTypeDialogOpen(true);
  };

  const handleDeleteEventType = (eventType: EventType) => {
    deleteEventTypeMutation.mutate(eventType.id);
  };

  const handleAddEvent = (eventType?: EventType) => {
    setSelectedEvent(undefined);
    setSelectedEventTypeForNewEvent(eventType);
    setIsEventDialogOpen(true);
  };

  const handleEditEvent = (event: EventWithTypeName) => {
    setSelectedEvent(event);
    setSelectedEventTypeForNewEvent(undefined);
    setIsEventDialogOpen(true);
  };

  const handleDeleteEvent = (event: EventWithTypeName) => {
    deleteEventMutation.mutate(event.id);
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Events</DialogTitle>
            <DialogDescription>
              Manage events to categorize and track cash account transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="mb-4 flex items-center justify-end">
              <Button size="sm" onClick={handleAddEventType}>
                <Icons.Plus className="mr-1 h-4 w-4" />
                Add Event Type
              </Button>
            </div>
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : eventTypes && eventTypes.length > 0 ? (
                <div className="divide-border divide-y rounded-md border">
                  {eventTypes.map((type) => {
                    const typeEvents = eventsByType[type.id] || [];
                    const hasEvents = typeEvents.length > 0;
                    const isExpanded = expandedTypes.has(type.id);

                    return (
                      <div key={type.id}>
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            {hasEvents ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => toggleExpanded(type.id)}
                              >
                                {isExpanded ? (
                                  <Icons.ChevronDown className="h-4 w-4" />
                                ) : (
                                  <Icons.ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            ) : (
                              <div className="w-6" />
                            )}
                            {type.color && (
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: type.color }}
                              />
                            )}
                            <span className="font-medium">{type.name}</span>
                            {hasEvents && (
                              <span className="text-muted-foreground text-xs">
                                ({typeEvents.length})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddEvent(type)}
                              title="Add event"
                            >
                              <Icons.Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditEventType(type)}
                              title="Edit event type"
                            >
                              <Icons.Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" title="Delete event type">
                                  <Icons.Trash className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Event Type</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete &quot;{type.name}&quot;?
                                    {hasEvents && (
                                      <span className="text-destructive mt-2 block font-medium">
                                        This will also delete all {typeEvents.length} event(s) under
                                        this type.
                                      </span>
                                    )}
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteEventType(type)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        {hasEvents && isExpanded && (
                          <div className="space-y-0">
                            {typeEvents.map((event) => (
                              <div key={event.id} className="ml-6 border-l pl-4">
                                <div className="flex items-center justify-between py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-6" />
                                    <div>
                                      <span className="text-sm">{event.name}</span>
                                      <div className="text-muted-foreground flex items-center gap-2 text-xs">
                                        {event.isDynamicRange ? (
                                          <span className="italic">Dynamic dates</span>
                                        ) : (
                                          <span>
                                            {event.startDate} - {event.endDate}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditEvent(event)}
                                      title="Edit event"
                                    >
                                      <Icons.Pencil className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="sm" title="Delete event">
                                          <Icons.Trash className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Event</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to delete &quot;{event.name}
                                            &quot;? This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => handleDeleteEvent(event)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No event types yet. Click &quot;Add Event Type&quot; to create one.
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EventFormDialog
        eventTypes={eventTypes || []}
        open={isEventDialogOpen}
        onOpenChange={setIsEventDialogOpen}
        event={selectedEvent}
        defaultEventTypeId={selectedEventTypeForNewEvent?.id}
      />

      <EventTypeFormDialog
        eventType={selectedEventType}
        open={isEventTypeDialogOpen}
        onOpenChange={setIsEventTypeDialogOpen}
      />
    </>
  );
}
