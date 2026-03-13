// usePairingClaimer
// Self-contained hook for the claimer (new device) pairing flow.
// Uses backend-owned pairing flow coordinator for the post-SAS phase.
// Overwrite consent is handled by the auto-bootstrap AlertDialog after pairing.
// ================================================================

import { logger, beginPairingConfirm, getPairingFlowState, cancelPairingFlow } from "@/adapters";
import type { PairingFlowPhase } from "@/adapters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as crypto from "../crypto";
import { syncService } from "../services/sync-service";
import { syncStorage } from "../storage/keyring";
import type { ClaimerSession, KeyBundlePayload } from "../types";

type ClaimerPhase = "idle" | "connecting" | "claimed" | "flow_active" | "complete" | "error";

export type ClaimerStep =
  | "enter_code"
  | "connecting"
  | "waiting_keys"
  | "syncing"
  | "success"
  | "error";

export function usePairingClaimer() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<ClaimerPhase>("idle");
  const [session, setSession] = useState<ClaimerSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);

  // Guard against auto-proceed firing twice
  const autoProceedFired = useRef(false);

  // Poll for key bundle
  const keyPoll = useQuery({
    queryKey: ["sync", "pairing", "key-poll", session?.pairingId],
    queryFn: () => syncService.pollForKeyBundle(session!),
    enabled: phase === "claimed" && !!session,
    refetchInterval: (query) => (query.state.data?.received ? false : 2000),
    retry: false,
  });

  // Compute SAS from session key
  const sasQuery = useQuery({
    queryKey: ["sync", "pairing", "claimer-sas", session?.sessionKey],
    queryFn: () => crypto.computeSAS(session!.sessionKey),
    enabled: !!session?.sessionKey,
    staleTime: Infinity,
  });

  // Poll flow state when active
  const flowPoll = useQuery({
    queryKey: ["sync", "pairing", "flow-state", flowId],
    queryFn: () => getPairingFlowState(flowId!),
    enabled: phase === "flow_active" && !!flowId,
    refetchInterval: (query) => {
      const p = query.state.data?.phase?.phase;
      if (p === "success" || p === "error") return false;
      return 2000;
    },
    retry: false,
  });

  // Derive step
  const step: ClaimerStep = useMemo(() => {
    if (phase === "error") return "error";
    if (phase === "complete") return "success";
    if (phase === "flow_active") {
      if (flowPoll.error) return "error";
      return "syncing";
    }
    if (phase === "connecting") return "connecting";
    if (phase === "claimed") {
      if (keyPoll.error) return "error";
      return "waiting_keys";
    }
    return "enter_code";
  }, [phase, keyPoll.error, flowPoll.error]);

  // Derive error message
  const errorMessage = useMemo(() => {
    if (error) return error;
    if (flowPoll.error) {
      return flowPoll.error instanceof Error ? flowPoll.error.message : String(flowPoll.error);
    }
    if (keyPoll.error) {
      return keyPoll.error instanceof Error ? keyPoll.error.message : String(keyPoll.error);
    }
    return null;
  }, [error, keyPoll.error, flowPoll.error]);

  // Auto-proceed: when key bundle received, store credentials + call beginPairingConfirm
  useEffect(() => {
    if (phase !== "claimed") return;
    if (!keyPoll.data?.received || !keyPoll.data.keyBundle || !session) return;
    if (autoProceedFired.current) return;
    autoProceedFired.current = true;

    const keyBundle: KeyBundlePayload = keyPoll.data.keyBundle;
    const keyBundleCreatedAt = keyPoll.data.keyBundleCreatedAt;

    (async () => {
      try {
        // Store E2EE credentials before confirming
        await syncStorage.setE2EECredentials(keyBundle.rootKey, keyBundle.keyVersion, {
          secretKey: session.ephemeralSecretKey,
          publicKey: session.ephemeralPublicKey,
        });

        // Compute proof
        const proofData = `confirm:${session.pairingId}:${keyBundle.keyVersion}`;
        const proof = await crypto.hmacSha256(session.sessionKey, proofData);
        const freshnessGate = keyBundleCreatedAt ?? session.keyBundleCreatedAt;

        logger.info("[usePairingClaimer] Auto-proceeding to beginPairingConfirm");
        const result = await beginPairingConfirm(session.pairingId, proof, freshnessGate);

        setFlowId(result.flowId);
        setPhase("flow_active");
        processFlowPhase(result.phase);
      } catch (err) {
        logger.error(`[usePairingClaimer] Auto-proceed error: ${err}`);
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();
  }, [phase, keyPoll.data, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Process flow poll results
  useEffect(() => {
    if (phase !== "flow_active") return;
    const data = flowPoll.data;
    if (!data) return;
    processFlowPhase(data.phase);
  }, [phase, flowPoll.data]); // eslint-disable-line react-hooks/exhaustive-deps

  function processFlowPhase(flowPhase: PairingFlowPhase) {
    switch (flowPhase.phase) {
      case "overwrite_required":
        // Backend no longer sends this during pairing — treat as syncing
        break;
      case "syncing":
        break;
      case "success":
        setPhase("complete");
        queryClient.invalidateQueries({ queryKey: ["sync"] });
        break;
      case "error":
        setError(flowPhase.message);
        setPhase("error");
        break;
    }
  }

  const submitCode = useCallback(async (code: string) => {
    logger.info(`[usePairingClaimer] Submitting code`);
    setError(null);
    autoProceedFired.current = false;
    setPhase("connecting");
    try {
      const s = await syncService.claimPairingSession(code);
      logger.info(`[usePairingClaimer] Session claimed, pairingId=${s.pairingId}`);
      setSession(s);
      setPhase("claimed");
    } catch (err) {
      logger.error(`[usePairingClaimer] Claim error: ${err}`);
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  const cancel = useCallback(async () => {
    if (flowId) {
      await cancelPairingFlow(flowId).catch(() => {});
    }
    if (session) {
      await syncService.cancelPairing(session.pairingId).catch(() => {});
    }
    setSession(null);
    setFlowId(null);
    setPhase("idle");
    setError(null);
    autoProceedFired.current = false;
  }, [session, flowId]);

  const retry = useCallback(() => {
    setSession(null);
    setFlowId(null);
    setPhase("idle");
    setError(null);
    autoProceedFired.current = false;
  }, []);

  return {
    step,
    error: errorMessage,
    sas: sasQuery.data ?? null,
    submitCode,
    cancel,
    retry,
  };
}
