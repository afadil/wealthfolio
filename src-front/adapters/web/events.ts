// Web adapter - SSE Bridge and Event Listeners

import { getAuthToken } from "@/lib/auth-token";
import { logger, EVENTS_ENDPOINT } from "./core";
import type { EventCallback, UnlistenFn } from "../types";

// ============================================================================
// Server-Sent Events Bridge
// ============================================================================

class ServerEventBridge {
  private eventSource: EventSource | null = null;
  private readonly listeners = new Map<string, Set<EventCallback<unknown>>>();
  private readonly eventHandlers = new Map<string, EventListener>();
  private nextEventId = 0;

  constructor(private readonly url: string) {}

  async listen<T>(eventName: string, handler: EventCallback<T>): Promise<UnlistenFn> {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      throw new Error("EventSource is not available in this environment.");
    }
    this.ensureConnection();
    this.addListener(eventName, handler as EventCallback<unknown>);
    return async () => {
      this.removeListener(eventName, handler as EventCallback<unknown>);
    };
  }

  private ensureConnection() {
    if (this.eventSource) {
      return;
    }
    const eventUrl = this.buildEventUrl();
    this.eventSource = new EventSource(eventUrl);
    this.eventSource.onerror = (error) => {
      logger.warn("Portfolio event stream error", error);
    };
  }

  private buildEventUrl(): string {
    const token = getAuthToken();
    if (!token) {
      return this.url;
    }

    const separator = this.url.includes("?") ? "&" : "?";
    return `${this.url}${separator}access_token=${encodeURIComponent(token)}`;
  }

  private addListener(eventName: string, handler: EventCallback<unknown>) {
    const listeners = this.listeners.get(eventName) ?? new Set<EventCallback<unknown>>();
    listeners.add(handler);
    this.listeners.set(eventName, listeners);

    if (!this.eventHandlers.has(eventName) && this.eventSource) {
      const listener = (event: MessageEvent) => {
        const payload = this.parsePayload(event.data);
        this.emit(eventName, payload);
      };
      this.eventSource.addEventListener(eventName, listener as EventListener);
      this.eventHandlers.set(eventName, listener as EventListener);
    }
  }

  private removeListener(eventName: string, handler: EventCallback<unknown>) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }
    listeners.delete(handler);
    if (listeners.size === 0) {
      this.listeners.delete(eventName);
      const registered = this.eventHandlers.get(eventName);
      if (registered && this.eventSource) {
        this.eventSource.removeEventListener(eventName, registered);
      }
      this.eventHandlers.delete(eventName);
    }

    if (this.listeners.size === 0) {
      this.teardown();
    }
  }

  private teardown() {
    if (!this.eventSource) {
      return;
    }
    this.eventHandlers.forEach((handler, name) => {
      this.eventSource?.removeEventListener(name, handler);
    });
    this.eventHandlers.clear();
    this.eventSource.close();
    this.eventSource = null;
  }

  private parsePayload(raw: string | null): unknown {
    if (raw === null || raw === undefined || raw.length === 0 || raw === "null") {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return raw;
    }
  }

  private emit(eventName: string, payload: unknown) {
    const listeners = this.listeners.get(eventName);
    if (!listeners || listeners.size === 0) {
      return;
    }
    const eventObject = {
      event: eventName,
      id: ++this.nextEventId,
      payload,
    };
    listeners.forEach((listener) => {
      listener(eventObject);
    });
  }
}

const portfolioEventBridge = new ServerEventBridge(EVENTS_ENDPOINT);

// ============================================================================
// Event Listeners
// ============================================================================

export const listenPortfolioUpdateStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("portfolio:update-start", handler);
};

export const listenPortfolioUpdateComplete = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("portfolio:update-complete", handler);
};

export const listenPortfolioUpdateError = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("portfolio:update-error", handler);
};

export const listenMarketSyncStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("market:sync-start", handler);
};

export const listenMarketSyncComplete = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("market:sync-complete", handler);
};

// Desktop-only features - no-op in web
export const listenFileDropHover = async <T>(_handler: EventCallback<T>): Promise<UnlistenFn> => {
  return async () => {};
};

export const listenFileDrop = async <T>(_handler: EventCallback<T>): Promise<UnlistenFn> => {
  return async () => {};
};

export const listenFileDropCancelled = async <T>(_handler: EventCallback<T>): Promise<UnlistenFn> => {
  return async () => {};
};

export const listenDatabaseRestored = async <T>(_handler: EventCallback<T>): Promise<UnlistenFn> => {
  return async () => {};
};

export const listenNavigateToRoute = async <T>(_handler: EventCallback<T>): Promise<UnlistenFn> => {
  return async () => {};
};

export const listenDeepLink = async <T>(_handler: EventCallback<T>): Promise<UnlistenFn> => {
  return async () => {};
};

// Broker sync events
export const listenBrokerSyncStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("broker:sync-start", handler);
};

export const listenBrokerSyncComplete = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("broker:sync-complete", handler);
};

export const listenBrokerSyncError = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("broker:sync-error", handler);
};
