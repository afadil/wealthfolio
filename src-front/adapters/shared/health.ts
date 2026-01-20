// Health Center Commands
import type { FixAction, HealthConfig, HealthStatus } from "@/lib/types";
import { invoke } from "./platform";

/**
 * Get current health status (cached or fresh check).
 */
export const getHealthStatus = async (): Promise<HealthStatus> => {
  return invoke<HealthStatus>("get_health_status");
};

/**
 * Run health checks and return fresh status.
 */
export const runHealthChecks = async (): Promise<HealthStatus> => {
  return invoke<HealthStatus>("run_health_checks");
};

/**
 * Dismiss a health issue.
 */
export const dismissHealthIssue = async (issueId: string, dataHash: string): Promise<void> => {
  return invoke<void>("dismiss_health_issue", { issueId, dataHash });
};

/**
 * Restore a dismissed health issue.
 */
export const restoreHealthIssue = async (issueId: string): Promise<void> => {
  return invoke<void>("restore_health_issue", { issueId });
};

/**
 * Get list of dismissed issue IDs.
 */
export const getDismissedHealthIssues = async (): Promise<string[]> => {
  return invoke<string[]>("get_dismissed_health_issues");
};

/**
 * Execute a fix action.
 */
export const executeHealthFix = async (action: FixAction): Promise<void> => {
  return invoke<void>("execute_health_fix", { action });
};

/**
 * Get health configuration.
 */
export const getHealthConfig = async (): Promise<HealthConfig> => {
  return invoke<HealthConfig>("get_health_config");
};

/**
 * Update health configuration.
 */
export const updateHealthConfig = async (config: HealthConfig): Promise<void> => {
  return invoke<void>("update_health_config", { config });
};
