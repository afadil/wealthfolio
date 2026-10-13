import { deferProfileReload } from "./session";
import { reloadApplication } from "@/lib/reload-application";
import { profileCommand } from "./api";
let flowId: string | undefined;
let nativePending = false;
export const isNativeAuthPending = () => nativePending;
export function createProfilePkceStorage(storageKey: string) {
  let storageFlowId: string | undefined;
  const memory = new Map<string, string>();
  const pkceKey = `${storageKey}-code-verifier`;
  return {
    async getItem(key: string) {
      if (key !== pkceKey) return memory.get(key) ?? null;
      const result = await profileCommand<[string, string] | null>(
        "profile_auth_storage",
        { operation: "get", key, flowId: storageFlowId },
        true,
      );
      if (!result) return null;
      storageFlowId = result[0];
      flowId = storageFlowId;
      return result[1];
    },
    async setItem(key: string, value: string) {
      if (key === pkceKey) {
        storageFlowId = await profileCommand<string>(
          "profile_auth_storage",
          { operation: "set", key, value, flowId },
          true,
        );
        flowId = storageFlowId;
      } else memory.set(key, value);
    },
    async removeItem(key: string) {
      if (key === pkceKey && storageFlowId)
        await profileCommand(
          "profile_auth_storage",
          { operation: "remove", flowId: storageFlowId },
          true,
        );
      else memory.delete(key);
    },
  };
}
export function beginProfileLogin(redirect: string): string {
  flowId = crypto.randomUUID();
  const url = new URL(redirect);
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.set("wf_profile_flow", flowId);
  url.hash = fragment.toString();
  return url.toString();
}
export async function ownsProfileCallback(callback: string): Promise<boolean> {
  const url = new URL(callback);
  const expected =
    new URLSearchParams(url.hash.slice(1)).get("wf_profile_flow") ??
    url.searchParams.get("wf_profile_flow");
  if (!expected) return false;
  return profileCommand<boolean>(
    "profile_auth_storage",
    { operation: "validate", flowId: expected },
    true,
  );
}
// This bridge survives unmounting the financial providers. Never reload while
// the native plugin's promise still owns a callback delivery.
export async function launchProfileOAuth(url: string) {
  const pendingFlow = flowId;
  if (!pendingFlow) throw new Error("No pending profile login");
  nativePending = true;
  deferProfileReload(true);
  window.dispatchEvent(new Event("wealthfolio:auth-pending"));
  try {
    const { authenticate } = await import("tauri-plugin-web-auth-api");
    const result = await authenticate({ url, callbackScheme: "wealthfolio" });
    if (result?.callbackUrl)
      await profileCommand("capture_profile_auth_callback", {
        flowId: pendingFlow,
        callback: result.callbackUrl,
      });
  } finally {
    nativePending = false;
    reloadApplication();
    deferProfileReload(false);
    window.dispatchEvent(new Event("wealthfolio:auth-pending"));
  }
}
