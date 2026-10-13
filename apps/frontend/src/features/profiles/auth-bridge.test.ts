import { beforeEach, expect, it, vi } from "vitest";
const command = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ profileCommand: command }));
beforeEach(() => {
  vi.resetModules();
  command.mockReset();
});
it("late SDK cleanup keeps the verifier owned by its original flow", async () => {
  const { createProfilePkceStorage } = await import("./auth-bridge");
  const a = createProfilePkceStorage("auth");
  const b = createProfilePkceStorage("auth");
  command.mockResolvedValueOnce("flow-a").mockResolvedValueOnce("flow-b");
  await a.setItem("auth-code-verifier", "verifier-a");
  await b.setItem("auth-code-verifier", "verifier-b");
  await a.removeItem("auth-code-verifier");
  expect(command).toHaveBeenLastCalledWith(
    "profile_auth_storage",
    { operation: "remove", flowId: "flow-a" },
    true,
  );
});
it("restores PKCE across a reload but keeps SDK session tokens in memory", async () => {
  const { createProfilePkceStorage } = await import("./auth-bridge");
  const storage = createProfilePkceStorage("auth");
  command.mockResolvedValueOnce(["flow", "saved-verifier"]);
  expect(await storage.getItem("auth-code-verifier")).toBe("saved-verifier");
  await storage.setItem("auth", "session-token");
  expect(await storage.getItem("auth")).toBe("session-token");
  expect(command).toHaveBeenCalledTimes(1);
  expect(await createProfilePkceStorage("auth").getItem("auth")).toBeNull();
});

it("carries callback ownership through the existing hosted bounce fragment", async () => {
  const { beginProfileLogin, ownsProfileCallback } = await import("./auth-bridge");
  const redirect = new URL(beginProfileLogin("https://connect.example/deeplink"));
  const flow = new URLSearchParams(redirect.hash.slice(1)).get("wf_profile_flow");
  expect(flow).toBeTruthy();
  command.mockResolvedValueOnce(true);
  expect(await ownsProfileCallback(`wealthfolio://auth/callback?code=test${redirect.hash}`)).toBe(
    true,
  );
  expect(command).toHaveBeenLastCalledWith(
    "profile_auth_storage",
    { operation: "validate", flowId: flow },
    true,
  );
  expect(await ownsProfileCallback("wealthfolio://auth/callback?code=uncorrelated")).toBe(false);
});
