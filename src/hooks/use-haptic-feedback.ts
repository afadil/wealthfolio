import { useCallback } from "react";
import { usePlatform } from "./use-platform";

type HapticsModule = typeof import("@tauri-apps/plugin-haptics");

let hapticsModulePromise: Promise<HapticsModule> | null = null;

async function loadHapticsModule(): Promise<HapticsModule> {
  hapticsModulePromise ??= import("@tauri-apps/plugin-haptics");
  return hapticsModulePromise;
}

/**
 * Hook to trigger haptic feedback on mobile devices
 * @returns A function to trigger haptic feedback
 */
export function useHapticFeedback() {
  const { isMobile, isTauri } = usePlatform();

  const triggerHaptic = useCallback(() => {
    if (!isMobile || !isTauri) {
      return;
    }

    void (async () => {
      try {
        const haptics = await loadHapticsModule();
        if (typeof haptics.selectionFeedback === "function") {
          await haptics.selectionFeedback();
          return;
        }

        if (typeof haptics.impactFeedback === "function") {
          await haptics.impactFeedback("medium");
        }
      } catch (unknownError) {
        if (import.meta.env.DEV) {
          console.warn("Haptic feedback unavailable:", unknownError);
        }
      }
    })();
  }, [isMobile, isTauri]);

  return triggerHaptic;
}
