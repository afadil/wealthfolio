import type { EventType, NewEventType, UpdateEventType } from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb } from "@/adapters";
import { logger } from "@/adapters";

export const getEventTypes = async (): Promise<EventType[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_event_types");
      case RUN_ENV.WEB:
        return invokeWeb("get_event_types");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching event types.");
    throw error;
  }
};

export const getEventType = async (id: string): Promise<EventType> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_event_type", { id });
      case RUN_ENV.WEB:
        return invokeWeb("get_event_type", { id });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching event type.");
    throw error;
  }
};

export const createEventType = async (eventType: NewEventType): Promise<EventType> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_event_type", { eventType });
      case RUN_ENV.WEB:
        return invokeWeb("create_event_type", { eventType });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating event type.");
    throw error;
  }
};

export const updateEventType = async (id: string, update: UpdateEventType): Promise<EventType> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_event_type", { id, update });
      case RUN_ENV.WEB:
        return invokeWeb("update_event_type", { id, update });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating event type.");
    throw error;
  }
};

export const deleteEventType = async (eventTypeId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_event_type", { eventTypeId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_event_type", { eventTypeId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting event type.");
    throw error;
  }
};
