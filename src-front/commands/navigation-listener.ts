import type { EventCallback, UnlistenFn } from "@/adapters";
import { listenNavigateToRoute as listenNavigateToRouteAdapter, logger } from "@/adapters";

export async function listenNavigateToRoute<T>(handler: EventCallback<T>): Promise<UnlistenFn> {
  try {
    return await listenNavigateToRouteAdapter(handler);
  } catch (_error) {
    logger.error("Error listen navigate-to-route event.");
    return async () => {};
  }
}
