import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), scope: vi.fn(() => "profile") }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("@/features/profiles/session", () => ({
  profileScope: () => mocks.scope(),
  revokeProfileSession: vi.fn(),
}));
import { invoke } from "./core";
it("reads the native system theme without acquiring a portfolio scope", async () => {
  mocks.scope.mockImplementation(() => {
    throw new Error("PROFILE_LOCKED");
  });
  mocks.invoke.mockResolvedValue("dark");
  await expect(invoke("get_system_theme")).resolves.toBe("dark");
  expect(mocks.invoke).toHaveBeenCalledWith("get_system_theme", undefined);
  expect(mocks.scope).not.toHaveBeenCalled();
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
it("lets manual capture finish after the ordinary five-minute deadline", async () => {
  vi.useFakeTimers();
  let complete!: (value: string) => void;
  mocks.invoke.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
  );
  const result = invoke<string>("cloud_backup_capture");
  let finished = false;
  result.then(() => {
    finished = true;
  });
  await vi.advanceTimersByTimeAsync(6 * 60_000);
  expect(finished).toBe(false);
  complete("saved");
  await expect(result).resolves.toBe("saved");
  expect(vi.getTimerCount()).toBe(0);
});
it("preserves the ordinary deadline for unrelated commands", async () => {
  vi.useFakeTimers();
  mocks.invoke.mockImplementation(() => new Promise(() => {}));
  const result = invoke("get_accounts");
  const assertion = expect(result).rejects.toThrow('Command "get_accounts" timed out');
  await vi.advanceTimersByTimeAsync(300_001);
  await assertion;
});
