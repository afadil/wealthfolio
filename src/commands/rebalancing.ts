/**
 * Portfolio Rebalancing Commands
 *
 * Technical name: "rebalancing" (to distinguish from goals_allocation feature)
 * User-facing name: "Allocations" (displayed in menus and UI)
 *
 * Backend tables: rebalancing_strategies, asset_class_targets, holding_targets
 * Frontend types: RebalancingStrategy, AssetClassTarget, HoldingTarget
 */

import { getRunEnv, invokeTauri, logger, RUN_ENV } from "@/adapters";
import type {
    AssetClassTarget,
    HoldingTarget,
    NewAssetClassTarget,
    NewHoldingTarget,
    NewRebalancingStrategy,
    RebalancingStrategy,
} from "@/lib/types";

// ============================================================================
// Strategy Commands
// ============================================================================

export const getRebalancingStrategies = async (): Promise<RebalancingStrategy[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_rebalancing_strategies");
      case RUN_ENV.WEB:
        const response = await fetch("/api/v1/rebalancing/strategies");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error fetching rebalancing strategies.");
    throw error;
  }
};

export const getRebalancingStrategy = async (id: string): Promise<RebalancingStrategy | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_rebalancing_strategy", { id });
      case RUN_ENV.WEB:
        const response = await fetch(`/api/v1/rebalancing/strategy/${id}`);
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error(`Error fetching rebalancing strategy ${id}.`);
    throw error;
  }
};

export const saveRebalancingStrategy = async (
  strategy: NewRebalancingStrategy | RebalancingStrategy
): Promise<RebalancingStrategy> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("save_rebalancing_strategy", { strategy });
      case RUN_ENV.WEB:
        const method = "id" in strategy ? "PUT" : "POST";
        const endpoint = "id" in strategy
          ? `/api/v1/rebalancing/strategy/${strategy.id}`
          : "/api/v1/rebalancing/strategy";
        const response = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(strategy),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error saving rebalancing strategy.");
    throw error;
  }
};

export const deleteRebalancingStrategy = async (id: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_rebalancing_strategy", { id });
        return;
      case RUN_ENV.WEB:
        const response = await fetch(`/api/v1/rebalancing/strategy/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return;
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error(`Error deleting rebalancing strategy ${id}.`);
    throw error;
  }
};

// ============================================================================
// Asset Class Target Commands
// ============================================================================

export const getAssetClassTargets = async (strategyId: string): Promise<AssetClassTarget[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_asset_class_targets", { strategyId });
      case RUN_ENV.WEB:
        const response = await fetch(`/api/v1/rebalancing/strategy/${strategyId}/targets`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error(`Error fetching asset class targets for strategy ${strategyId}.`);
    throw error;
  }
};

export const saveAssetClassTarget = async (
  target: NewAssetClassTarget | AssetClassTarget
): Promise<AssetClassTarget> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("save_asset_class_target", { target });
      case RUN_ENV.WEB:
        const method = "id" in target ? "PUT" : "POST";
        const endpoint = "id" in target
          ? `/api/v1/rebalancing/target/${target.id}`
          : "/api/v1/rebalancing/target";
        const response = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error saving asset class target.");
    throw error;
  }
};

export const deleteAssetClassTarget = async (id: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_asset_class_target", { id });
        return;
      case RUN_ENV.WEB:
        const response = await fetch(`/api/v1/rebalancing/target/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return;
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error(`Error deleting asset class target ${id}.`);
    throw error;
  }
};

// ============================================================================
// Holding Target Commands (Phase 2)
// ============================================================================

export const getHoldingTargets = async (assetClassId: string): Promise<HoldingTarget[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_holding_targets", { assetClassId });
      case RUN_ENV.WEB:
        const response = await fetch(`/api/v1/rebalancing/holding-targets/${assetClassId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error(`Error fetching holding targets for asset class ${assetClassId}.`);
    throw error;
  }
};

export const saveHoldingTarget = async (
  target: NewHoldingTarget | HoldingTarget
): Promise<HoldingTarget> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("save_holding_target", { target });
      case RUN_ENV.WEB:
        const response = await fetch("/api/v1/rebalancing/holding-targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error saving holding target.");
    throw error;
  }
};

export const deleteHoldingTarget = async (id: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_holding_target", { id });
        return;
      case RUN_ENV.WEB:
        const response = await fetch(`/api/v1/rebalancing/holding-targets/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return;
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error(`Error deleting holding target ${id}.`);
    throw error;
  }
};

export const toggleHoldingTargetLock = async (id: string): Promise<HoldingTarget> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("toggle_holding_target_lock", { id });
      case RUN_ENV.WEB:
        const response = await fetch(`/api/v1/rebalancing/holding-targets/${id}/toggle-lock`, {
          method: "PUT",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error(`Error toggling lock for holding target ${id}.`);
    throw error;
  }
};
