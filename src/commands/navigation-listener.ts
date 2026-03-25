import type { EventCallback, UnlistenFn } from "@/adapters";
import { listenNavigateToRouteTauri, logger } from "@/adapters";

export async function listenNavigateToRoute<T>(handler: EventCallback<T>): Promise<UnlistenFn> {
  try {
    return listenNavigateToRouteTauri<T>(handler);
  } catch (_error) {
    logger.error("Error listen navigate-to-route event.");
    return () => {
      return;
    };
  }
}
