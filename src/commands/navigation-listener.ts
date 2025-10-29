import type { EventCallback, UnlistenFn } from "@/adapters";
import { listenNavigateToRouteTauri, getRunEnv, RUN_ENV, logger } from "@/adapters";

export async function listenNavigateToRoute<T>(handler: EventCallback<T>): Promise<UnlistenFn> {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenNavigateToRouteTauri<T>(handler);
      case RUN_ENV.WEB:
        return () => {
          return;
        };
      default:
        return () => {
          return;
        };
    }
  } catch (_error) {
    logger.error("Error listen navigate-to-route event.");
    return () => {
      return;
    };
  }
}
