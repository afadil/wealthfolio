import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FixAction, HealthConfig, HealthStatus } from "@/lib/types";
import {
  dismissHealthIssue,
  executeHealthFix,
  getHealthConfig,
  getHealthStatus,
  restoreHealthIssue,
  runHealthChecks,
  updateHealthConfig,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { useAuth } from "@/context/auth-context";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

/**
 * Hook for fetching health status.
 */
export function useHealthStatus() {
  const { isAuthenticated, statusLoading } = useAuth();

  return useQuery<HealthStatus, Error>({
    queryKey: [QueryKeys.HEALTH_STATUS],
    queryFn: getHealthStatus,
    enabled: !statusLoading && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for running health checks.
 */
export function useRunHealthChecks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runHealthChecks,
    onSuccess: (data) => {
      queryClient.setQueryData([QueryKeys.HEALTH_STATUS], data);
    },
    onError: (error: Error) => {
      toast.error("Health check failed", { description: error.message });
    },
  });
}

/**
 * Hook for dismissing a health issue.
 */
export function useDismissHealthIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, dataHash }: { issueId: string; dataHash: string }) =>
      dismissHealthIssue(issueId, dataHash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_STATUS] });
      toast.success("Issue dismissed");
    },
    onError: (error: Error) => {
      toast.error("Failed to dismiss issue", { description: error.message });
    },
  });
}

/**
 * Hook for restoring a dismissed health issue.
 */
export function useRestoreHealthIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreHealthIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_STATUS] });
      toast.success("Issue restored");
    },
    onError: (error: Error) => {
      toast.error("Failed to restore issue", { description: error.message });
    },
  });
}

/**
 * Hook for executing a fix action.
 */
export function useExecuteHealthFix() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (action: FixAction) => executeHealthFix(action),
    onSuccess: () => {
      // Refresh health status after fix
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_STATUS] });
      toast.success("Fix applied", { description: "Refreshing health status..." });
    },
    onError: (error: Error) => {
      toast.error("Fix failed", { description: error.message });
    },
  });
}

/**
 * Hook for fetching health configuration.
 */
export function useHealthConfig() {
  const { isAuthenticated, statusLoading } = useAuth();

  return useQuery<HealthConfig, Error>({
    queryKey: [QueryKeys.HEALTH_CONFIG],
    queryFn: getHealthConfig,
    enabled: !statusLoading && isAuthenticated,
  });
}

/**
 * Hook for updating health configuration.
 */
export function useUpdateHealthConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateHealthConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_CONFIG] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_STATUS] });
      toast.success("Configuration updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update configuration", { description: error.message });
    },
  });
}
