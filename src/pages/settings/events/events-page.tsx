import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import { getEventsWithNames, getEventActivityCounts } from '@/commands/event';
import { getEventTypes } from '@/commands/event-type';
import { toast } from '@/components/ui/use-toast';
import { SettingsHeader } from '../settings-header';
import {
  Button,
  Icons,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@wealthfolio/ui';
import { EventFormDialog } from './components/event-form-dialog';
import { EventTypeFormDialog } from './components/event-type-form-dialog';
import { useEventTypeMutations } from './use-event-type-mutations';
import { useEventMutations } from './use-event-mutations';
import type { EventType, EventWithTypeName } from '@/lib/types';

export const EventsPage = () => {
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isEventTypeDialogOpen, setIsEventTypeDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventWithTypeName | undefined>();
  const [selectedEventType, setSelectedEventType] = useState<EventType | undefined>();
  const [selectedEventTypeForNewEvent, setSelectedEventTypeForNewEvent] = useState<EventType | undefined>();
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: [QueryKeys.EVENTS_WITH_NAMES],
    queryFn: getEventsWithNames,
  });

  const { data: eventTypes, isLoading: typesLoading } = useQuery({
    queryKey: [QueryKeys.EVENT_TYPES],
    queryFn: getEventTypes,
  });

  const { data: activityCounts } = useQuery<Record<string, number>, Error>({
    queryKey: [QueryKeys.EVENT_ACTIVITY_COUNTS],
    queryFn: getEventActivityCounts,
  });

  const { deleteMutation: deleteEventTypeMutation } = useEventTypeMutations();
  const { deleteMutation: deleteEventMutation } = useEventMutations();

  const isLoading = eventsLoading || typesLoading;

  const eventsByType = (events || []).reduce((acc, event) => {
    if (!acc[event.eventTypeId]) {
      acc[event.eventTypeId] = [];
    }
    acc[event.eventTypeId].push(event);
    return acc;
  }, {} as Record<string, EventWithTypeName[]>);

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

  const getEventTypeTransactionCount = (typeId: string) => {
    const typeEvents = eventsByType[typeId] || [];
    return typeEvents.reduce((sum, event) => sum + (activityCounts?.[event.id] ?? 0), 0);
  };

  const handleDeleteEventClick = (event: EventWithTypeName) => {
    const count = activityCounts?.[event.id] ?? 0;
    if (count > 0) {
      toast({
        title: 'Cannot delete event',
        description: `This event has ${count} transaction${count !== 1 ? 's' : ''} associated with it. Please reassign or remove the transactions first.`,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteEventTypeClick = (eventType: EventType) => {
    const count = getEventTypeTransactionCount(eventType.id);
    if (count > 0) {
      toast({
        title: 'Cannot delete event type',
        description: `This event type has ${count} transaction${count !== 1 ? 's' : ''} associated with its events. Please reassign or remove the transactions first.`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Events"
        text="Manage events to categorize and track cash account transactions."
      >
        <Button onClick={handleAddEventType}>
          <Icons.Plus className="mr-2 h-4 w-4" />
          Add Event Type
        </Button>
      </SettingsHeader>
      <Separator />

      {isLoading ? (
        <div className="flex justify-center p-8">
          <p className="text-muted-foreground">Loading events...</p>
        </div>
      ) : eventTypes && eventTypes.length > 0 ? (
        <div className="divide-border divide-y rounded-md border">
          {eventTypes.map((type) => {
            const typeEvents = eventsByType[type.id] || [];
            const hasEvents = typeEvents.length > 0;
            const isExpanded = expandedTypes.has(type.id);
            const typeTransactionCount = getEventTypeTransactionCount(type.id);
            const hasTypeTransactions = typeTransactionCount > 0;

            return (
              <div key={type.id}>
                <div className="flex items-center justify-between py-3 px-4">
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
                      <span className="text-xs text-muted-foreground">
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
                    {hasTypeTransactions ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete event type"
                        onClick={() => handleDeleteEventTypeClick(type)}
                      >
                        <Icons.Trash className="h-4 w-4" />
                      </Button>
                    ) : (
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
                                <span className="mt-2 block font-medium text-destructive">
                                  This will also delete all {typeEvents.length} event(s) under this type.
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
                    )}
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
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{event.name}</span>
                                {(activityCounts?.[event.id] ?? 0) > 0 && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-xs text-muted-foreground cursor-default">
                                          ({activityCounts?.[event.id]})
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{activityCounts?.[event.id]} transaction{activityCounts?.[event.id] !== 1 ? 's' : ''}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {event.isDynamicRange ? (
                                  <span className="italic">Dynamic dates</span>
                                ) : (
                                  <span>{event.startDate} - {event.endDate}</span>
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
                            {(activityCounts?.[event.id] ?? 0) > 0 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Delete event"
                                onClick={() => handleDeleteEventClick(event)}
                              >
                                <Icons.Trash className="h-4 w-4" />
                              </Button>
                            ) : (
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
                                      Are you sure you want to delete &quot;{event.name}&quot;?
                                      This action cannot be undone.
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
                            )}
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
    </div>
  );
};
