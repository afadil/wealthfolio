import { afterEach, beforeEach, expect, it, vi } from "vitest";
const reload = vi.fn();
const replace = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { reload, replace }, addEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
it("coalesces competing reload requests into one navigation", async () => {
  const app = await import("./reload-application");
  app.reloadApplication({ dashboard: true });
  app.reloadApplication();
  expect(replace).toHaveBeenCalledExactlyOnceWith("/");
  expect(reload).not.toHaveBeenCalled();
});
it("defers all navigation until native OAuth releases its callback", async () => {
  const app = await import("./reload-application");
  app.deferApplicationReload(true);
  app.reloadApplication({ dashboard: true });
  app.reloadApplication();
  expect(reload).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  app.deferApplicationReload(false);
  app.reloadApplication();
  expect(reload).toHaveBeenCalledOnce();
  expect(replace).not.toHaveBeenCalled();
});
