import { afterEach, beforeEach, expect, it, vi } from "vitest";
const command = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ profileCommand: command }));
beforeEach(() => {
  vi.resetModules();
  command.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("uses secure random bytes for a UUID when randomUUID is unavailable", async () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => {
    bytes.set(Array.from({ length: 16 }, (_, index) => index));
    return bytes;
  });
  vi.stubGlobal("crypto", { getRandomValues });
  const { beginProfileLogin, createProfilePkceStorage, ownsProfileCallback } =
    await import("./auth-bridge");
  const redirect = new URL(beginProfileLogin("https://connect.example/deeplink#existing=value"));
  const fragment = new URLSearchParams(redirect.hash.slice(1));
  const flow = "00010203-0405-4607-8809-0a0b0c0d0e0f";
  expect(fragment.get("wf_profile_flow")).toBe(flow);
  expect(fragment.get("existing")).toBe("value");
  expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));

  command.mockResolvedValueOnce(flow);
  await createProfilePkceStorage("auth").setItem("auth-code-verifier", "test-verifier");
  expect(command).toHaveBeenLastCalledWith(
    "profile_auth_storage",
    { operation: "set", key: "auth-code-verifier", value: "test-verifier", flowId: flow },
    true,
  );
  command.mockResolvedValueOnce(true);
  expect(await ownsProfileCallback(`wealthfolio://auth/callback?code=test${redirect.hash}`)).toBe(
    true,
  );
  expect(command).toHaveBeenLastCalledWith(
    "profile_auth_storage",
    { operation: "validate", flowId: flow },
    true,
  );
});

it.each([undefined, {}])(
  "refuses to start login without secure randomness (%j)",
  async (crypto) => {
    vi.stubGlobal("crypto", crypto);
    const random = vi.spyOn(Math, "random");
    const { beginProfileLogin } = await import("./auth-bridge");
    expect(() => beginProfileLogin("https://connect.example/deeplink")).toThrow(
      "Secure randomness",
    );
    expect(random).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  },
);
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
