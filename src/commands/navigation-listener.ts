import type { EventCallback, UnlistenFn } from '@/adapters';
import { listenNavigateToRouteTauri } from '@/adapters';
import { logger } from '@/adapters';

export async function listenNavigateToRoute<T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  try {
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      return listenNavigateToRouteTauri<T>(handler);
    } else {
      // Return a no-op function for non-Tauri environments
      return () => {};
    }
  } catch (error) {
    logger.error('Error listen navigate-to-route event.');
    return () => {};
  }
}
