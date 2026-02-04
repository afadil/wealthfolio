import { useSettingsContext } from "@/lib/settings-provider";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSettings } from "@/commands/settings";
import type { Settings } from "@/lib/types";

export type AllocationHoldingTargetMode = "preview" | "strict";
export type AllocationDefaultView = "overview" | "holdings-table";

interface AllocationSettings {
  holdingTargetMode: AllocationHoldingTargetMode;
  defaultView: AllocationDefaultView;
  settingsBannerDismissed: boolean;
}

interface UseAllocationSettingsReturn {
  settings: AllocationSettings;
  isLoading: boolean;
  updateHoldingTargetMode: (mode: AllocationHoldingTargetMode) => Promise<void>;
  updateDefaultView: (view: AllocationDefaultView) => Promise<void>;
  dismissSettingsBanner: () => Promise<void>;
}

const DEFAULT_HOLDING_TARGET_MODE: AllocationHoldingTargetMode = "preview";
const DEFAULT_VIEW: AllocationDefaultView = "overview";

export function useAllocationSettings(): UseAllocationSettingsReturn {
  const { settings: globalSettings, isLoading } = useSettingsContext();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Settings>) => {
      await updateSettings(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  // Parse allocation settings with defaults
  const allocationSettings: AllocationSettings = {
    holdingTargetMode: globalSettings?.allocationHoldingTargetMode || DEFAULT_HOLDING_TARGET_MODE,
    defaultView: globalSettings?.allocationDefaultView || DEFAULT_VIEW,
    settingsBannerDismissed: globalSettings?.allocationSettingsBannerDismissed === "true",
  };

  const updateHoldingTargetMode = async (mode: AllocationHoldingTargetMode) => {
    await updateMutation.mutateAsync({
      allocationHoldingTargetMode: mode,
    });
  };

  const updateDefaultView = async (view: AllocationDefaultView) => {
    await updateMutation.mutateAsync({
      allocationDefaultView: view,
    });
  };

  const dismissSettingsBanner = async () => {
    await updateMutation.mutateAsync({
      allocationSettingsBannerDismissed: "true",
    });
  };

  return {
    settings: allocationSettings,
    isLoading,
    updateHoldingTargetMode,
    updateDefaultView,
    dismissSettingsBanner,
  };
}
