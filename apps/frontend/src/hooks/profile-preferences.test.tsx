import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  NavigationModeProvider,
  useNavigationMode,
} from "@/pages/layouts/navigation/navigation-mode-context";
import { readProfilePreference, usePersistentState } from "./use-persistent-state";

const profile = vi.hoisted(() => ({ id: "legacy", legacy: true }));
vi.mock("@/features/profiles/session", () => ({
  selectedProfileId: () => profile.id,
  usesLegacyPreferences: () => profile.legacy,
}));

beforeEach(() => {
  localStorage.clear();
  profile.id = "legacy";
  profile.legacy = true;
});

it("falls back only for the adopted legacy profile and migrates on update", () => {
  localStorage.setItem("navigation-mode", JSON.stringify("launchbar"));
  const { result, unmount } = renderHook(() => usePersistentState("navigation-mode", "sidebar"));
  expect(result.current[0]).toBe("launchbar");
  expect(localStorage.getItem("profile:legacy:navigation-mode")).toBeNull();
  expect(readProfilePreference("navigation-mode")).toBe(JSON.stringify("launchbar"));
  act(() => result.current[1]("sidebar"));
  expect(localStorage.getItem("profile:legacy:navigation-mode")).toBe(JSON.stringify("sidebar"));
  expect(localStorage.getItem("navigation-mode")).toBe(JSON.stringify("launchbar"));
  unmount();
  const reopened = renderHook(() => usePersistentState("navigation-mode", "launchbar"));
  expect(reopened.result.current[0]).toBe("sidebar");
});

it.each([false, null, 0, ""])("prefers a scoped value of %s to the legacy value", (value) => {
  localStorage.setItem("preference", "true");
  localStorage.setItem("profile:legacy:preference", JSON.stringify(value));
  const { result } = renderHook(() => usePersistentState<unknown>("preference", "default"));
  expect(result.current[0]).toBe(value);
  expect(readProfilePreference("preference")).toBe(JSON.stringify(value));
});

it("does not inherit legacy preferences for a new profile, even if it is named Default", () => {
  profile.id = "default";
  profile.legacy = false;
  localStorage.setItem("preference", "true");
  const { result } = renderHook(() => usePersistentState("preference", false));
  expect(result.current[0]).toBe(false);
  expect(readProfilePreference("preference")).toBeNull();
});

it("preserves date revival when reading legacy preferences", () => {
  const date = new Date("2024-01-01T00:00:00.000Z");
  localStorage.setItem("range", JSON.stringify({ from: date }));
  const { result } = renderHook(() => usePersistentState("range", { from: new Date(0) }));
  expect(result.current[0].from).toEqual(date);
  expect(localStorage.getItem("profile:legacy:range")).toBeNull();
});

it("uses defaults for missing or malformed scoped preferences without reviving old values", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    localStorage.setItem("preference", "true");
    localStorage.setItem("profile:legacy:preference", "malformed");
    const { result } = renderHook(() => usePersistentState("preference", false));
    expect(result.current[0]).toBe(false);
    const missing = renderHook(() => usePersistentState("missing", false));
    expect(missing.result.current[0]).toBe(false);
  } finally {
    errors.mockRestore();
  }
});

it("ignores legacy and other-profile navigation events after admission", () => {
  profile.legacy = false;
  profile.id = "new";
  const { result } = renderHook(() => useNavigationMode(), { wrapper: NavigationModeProvider });
  for (const key of ["navigation-mode", "profile:other:navigation-mode"]) {
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: JSON.stringify("launchbar"),
        }),
      ),
    );
    expect(result.current.mode).toBe("sidebar");
  }
  expect(localStorage.getItem("profile:new:navigation-mode")).toBeNull();
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "profile:new:navigation-mode",
        newValue: JSON.stringify("launchbar"),
      }),
    ),
  );
  expect(result.current.mode).toBe("launchbar");
});
