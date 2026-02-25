import type { BootstrapAction } from "../types";

interface ReconcileIntentLike {
  bootstrapAction?: BootstrapAction;
}

export function resolveBootstrapAction(input: ReconcileIntentLike): BootstrapAction {
  if (input.bootstrapAction) {
    return input.bootstrapAction;
  }

  throw new Error("Missing bootstrapAction in reconcile response");
}

interface PairingSeedResponseLike {
  remoteSeedPresent?: boolean;
}

export function extractRemoteSeedPresent(response: PairingSeedResponseLike): boolean | null {
  if (typeof response.remoteSeedPresent === "boolean") {
    return response.remoteSeedPresent;
  }
  return null;
}
