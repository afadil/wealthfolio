import { installProfileSession } from "@/features/profiles/session";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./core";

beforeEach(() => {
  installProfileSession({ profileId: "test", scopeId: "scope-test" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("sends reset as an explicit POST for exactly one asset and returns committed state", async () => {
  const result = {
    assetId: "FX:USD/EUR",
    source: "YAHOO",
    fromDate: "2020-01-01",
    toDate: "2026-09-17",
    insertedCount: 3,
    deletedCount: 7,
  };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect(await invoke("reset_provider_history", { assetId: "FX:USD/EUR" })).toEqual(result);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/market-data/quotes/FX%3AUSD%2FEUR/reset");
  expect(options?.method).toBe("POST");
  expect(new Headers(options?.headers).get("x-wf-profile-scope")).toBe("scope-test");
  expect(options?.body).toBeUndefined();
});

it("posts the global reset exactly once without a selected asset", async () => {
  const result = { results: [], failures: [], skipped: [] };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect(await invoke("reset_all_provider_history")).toEqual(result);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/market-data/quotes/reset");
  expect(options?.method).toBe("POST");
  expect(new Headers(options?.headers).get("x-wf-profile-scope")).toBe("scope-test");
  expect(options?.body ?? "").not.toContain("assetId");
});

it.each([400, 408, 500, 504])("classifies HTTP %s reset responses", async (status) => {
  const message =
    status === 400
      ? "Asset or provider settings changed during fetching; history was not replaced"
      : "Reset completion could not be confirmed. Reload quotes before retrying.";
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(status === 408 ? null : JSON.stringify({ code: status, message }), { status }),
      ),
  );
  await expect(invoke("reset_provider_history", { assetId: "asset-1" })).rejects.toMatchObject({
    ...(status === 408 ? {} : { message }),
    outcomeUnknown: status === 408 || status >= 500,
  });
});
