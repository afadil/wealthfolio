import type { Event, EventWithTypeName, NewEvent, UpdateEvent } from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb } from "@/adapters";
import { logger } from "@/adapters";

export const getEvents = async (): Promise<Event[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_events");
      case RUN_ENV.WEB:
        return invokeWeb("get_events");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching events.");
    throw error;
  }
};

export const getEventsWithNames = async (): Promise<EventWithTypeName[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_events_with_names");
      case RUN_ENV.WEB:
        return invokeWeb("get_events_with_names");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching events with names.");
    throw error;
  }
};

export const getEvent = async (id: string): Promise<Event> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_event", { id });
      case RUN_ENV.WEB:
        return invokeWeb("get_event", { id });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching event.");
    throw error;
  }
};

export const createEvent = async (event: NewEvent): Promise<Event> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_event", { event });
      case RUN_ENV.WEB:
        return invokeWeb("create_event", { event });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating event.");
    throw error;
  }
};

export const updateEvent = async (id: string, update: UpdateEvent): Promise<Event> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_event", { id, update });
      case RUN_ENV.WEB:
        return invokeWeb("update_event", { id, update });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating event.");
    throw error;
  }
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_event", { eventId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_event", { eventId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting event.");
    throw error;
  }
};

export const validateTransactionDate = async (
  eventId: string,
  transactionDate: string
): Promise<boolean> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("validate_transaction_date", { eventId, transactionDate });
      case RUN_ENV.WEB:
        return invokeWeb("validate_transaction_date", { eventId, transactionDate });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error validating transaction date.");
    throw error;
  }
};

export const getEventActivityCounts = async (): Promise<Record<string, number>> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_event_activity_counts");
      case RUN_ENV.WEB:
        return invokeWeb("get_event_activity_counts");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching event activity counts.");
    throw error;
  }
};
