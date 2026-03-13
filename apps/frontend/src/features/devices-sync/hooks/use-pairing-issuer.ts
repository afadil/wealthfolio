// usePairingIssuer
// Self-contained hook for the issuer (trusted device) pairing flow.
// 0 useEffects, 0 refs. Polling via React Query. Step is derived.
// Replaces: usePairing hook + provider pairing actions.
// ================================================================

import { logger } from "@/adapters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import * as crypto from "../crypto";
import { syncService } from "../services/sync-service";
import { SyncError } from "../types";
import type { PairingSession } from "../types";

type IssuerPhase = "idle" | "created" | "transferring" | "complete" | "error";

export type IssuerStep =
  | "idle"
  | "display_code"
  | "verify_sas"
  | "transferring"
  | "success"
  | "error"
  | "expired";

export function usePairingIssuer() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<IssuerPhase>("idle");
  const [session, setSession] = useState<PairingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsRestore, setNeedsRestore] = useState(false);

  // Poll for claimer connection
  const claimerPoll = useQuery({
    queryKey: ["sync", "pairing", "claimer-poll", session?.pairingId],
    queryFn: () => syncService.pollForClaimerConnection(session!),
    enabled: phase === "created" && !!session,
    refetchInterval: (query) => (query.state.data?.claimed ? false : 2000),
    retry: false,
  });

  // Compute SAS when session key is available
  const sessionKey = claimerPoll.data?.sessionKey;
  const sasQuery = useQuery({
    queryKey: ["sync", "pairing", "sas", sessionKey],
    queryFn: () => crypto.computeSAS(sessionKey!),
    enabled: !!sessionKey,
    staleTime: Infinity,
  });

  // Derive step from state
  const step: IssuerStep = useMemo(() => {
    if (phase === "error") return "error";
    if (phase === "complete") return "success";
    if (phase === "transferring") return "transferring";
    if (!session) return "idle";
    if (session.expiresAt && new Date() > session.expiresAt) return "expired";
    if (claimerPoll.data?.claimed) return "verify_sas";
    if (claimerPoll.error) return "error";
    return "display_code";
  }, [phase, session, claimerPoll.data, claimerPoll.error]);

  // Derive error message
  const errorMessage = useMemo(() => {
    if (error) return error;
    if (claimerPoll.error) {
      return claimerPoll.error instanceof Error
        ? claimerPoll.error.message
        : String(claimerPoll.error);
    }
    return null;
  }, [error, claimerPoll.error]);

  const startPairing = useCallback(async () => {
    try {
      setError(null);
      setNeedsRestore(false);
      const s = await syncService.createPairingSession();
      logger.info(`[usePairingIssuer] Session created: ${s.pairingId}`);
      setSession(s);
      setPhase("created");
    } catch (err) {
      logger.error(`[usePairingIssuer] startPairing error: ${err}`);
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  const confirmSAS = useCallback(async () => {
    if (!session || !claimerPoll.data?.claimed) return;

    try {
      setError(null);
      setNeedsRestore(false);
      setPhase("transferring");

      // Build full session from local + poll data
      const fullSession: PairingSession = {
        ...session,
        claimerPublicKey: claimerPoll.data.claimerPublicKey,
        claimerDeviceId: claimerPoll.data.claimerDeviceId,
        sessionKey: claimerPoll.data.sessionKey,
        status: "claimed",
      };

      await syncService.completePairingWithTransfer(fullSession);
      logger.info("[usePairingIssuer] Pairing completed successfully");
      setPhase("complete");
      queryClient.invalidateQueries({ queryKey: ["sync"] });
    } catch (err) {
      logger.error(`[usePairingIssuer] confirmSAS error: ${err}`);

      // Check if pairing actually completed despite error
      try {
        const status = await syncService.getPairingStatus(session.pairingId);
        if (status === "completed") {
          setPhase("complete");
          queryClient.invalidateQueries({ queryKey: ["sync"] });
          return;
        }
      } catch {
        // ignore status check error
      }

      const syncError = SyncError.from(err);
      setError(syncError.message);
      setNeedsRestore(SyncError.needsSourceRestore(syncError));
      setPhase("error");
    }
  }, [session, claimerPoll.data, queryClient]);

  const rejectSAS = useCallback(async () => {
    if (session) {
      await syncService.cancelPairing(session.pairingId).catch(() => {});
    }
    setSession(null);
    setPhase("idle");
    setError(null);
    setNeedsRestore(false);
  }, [session]);

  const cancel = useCallback(async () => {
    if (session) {
      await syncService.cancelPairing(session.pairingId).catch(() => {});
    }
    setSession(null);
    setPhase("idle");
    setError(null);
    setNeedsRestore(false);
  }, [session]);

  const reset = useCallback(async () => {
    // If claimer has connected and we haven't completed yet, retry the transfer
    if (phase !== "complete" && session && claimerPoll.data?.claimed) {
      try {
        setError(null);
        setNeedsRestore(false);
        setPhase("transferring");

        const fullSession: PairingSession = {
          ...session,
          claimerPublicKey: claimerPoll.data.claimerPublicKey,
          claimerDeviceId: claimerPoll.data.claimerDeviceId,
          sessionKey: claimerPoll.data.sessionKey,
          status: "claimed",
        };

        await syncService.completePairingWithTransfer(fullSession);
        setPhase("complete");
        queryClient.invalidateQueries({ queryKey: ["sync"] });
        return;
      } catch (err) {
        logger.error(`[usePairingIssuer] retry complete error: ${err}`);
        const syncError = SyncError.from(err);
        setError(syncError.message);
        setNeedsRestore(SyncError.needsSourceRestore(syncError));
        setPhase("error");
        return;
      }
    }

    setSession(null);
    setPhase("idle");
    setError(null);
    setNeedsRestore(false);
  }, [phase, session, claimerPoll.data, queryClient]);

  return {
    step,
    error: errorMessage,
    needsRestore,
    sas: sasQuery.data ?? null,
    isSubmitting: phase === "transferring",
    pairingCode: session?.code ?? null,
    expiresAt: session?.expiresAt ?? null,
    startPairing,
    confirmSAS,
    rejectSAS,
    cancel,
    reset,
  };
}
