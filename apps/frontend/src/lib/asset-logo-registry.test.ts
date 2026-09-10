import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AssetLogo, AssetLogoSummary } from "@/lib/types";
import { AssetLogoRegistry, useAssetLogoOverride } from "./asset-logo-registry";

vi.mock("@/adapters", () => ({ getAssetLogo: vi.fn() }));

function summary(overrides: Partial<AssetLogoSummary> & { assetId: string }): AssetLogoSummary {
  return {
    displayCode: null,
    sha256: `sha-${overrides.assetId}`,
    updatedAt: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

function logo(assetId: string, sha256 = `sha-${assetId}`): AssetLogo {
  return {
    assetId,
    mimeType: "image/png",
    dataBase64: `bytes-${assetId}`,
    sha256,
    width: 256,
    height: 256,
    createdAt: "2026-09-02T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("AssetLogoRegistry", () => {
  it("treats asset ids as authoritative and ignores ambiguous symbols", () => {
    const registry = new AssetLogoRegistry(vi.fn());
    registry.setIndex([
      summary({ assetId: "a1", displayCode: "AAPL" }),
      summary({ assetId: "d1", displayCode: "DUP" }),
      summary({ assetId: "d2", displayCode: "dup" }),
    ]);

    expect(registry.resolve({ assetId: "a1" })?.sha256).toBe("sha-a1");
    expect(registry.resolve({ symbol: "aapl" })?.assetId).toBe("a1");
    expect(registry.resolve({ assetId: "missing", symbol: "AAPL" })).toBeUndefined();
    expect(registry.resolve({ assetId: "a1", symbol: "DUP" })?.assetId).toBe("a1");
    expect(registry.resolve({ symbol: "DUP" })).toBeUndefined();
    expect(registry.resolve({ assetId: "d2" })?.assetId).toBe("d2");
  });

  it("does not fall back to the base symbol for overrides", () => {
    const registry = new AssetLogoRegistry(vi.fn());
    registry.setIndex([summary({ assetId: "a1", displayCode: "SHOP" })]);

    expect(registry.resolve({ symbol: "SHOP.TO" })).toBeUndefined();
    expect(registry.resolve({ symbol: "SHOP" })).toBeDefined();
  });

  it("fetches bytes once per hash even under concurrency", async () => {
    const pending = deferred<AssetLogo | null>();
    const fetchLogo = vi.fn().mockReturnValue(pending.promise);
    const registry = new AssetLogoRegistry(fetchLogo);
    registry.setIndex([summary({ assetId: "a1" })]);
    const ref = registry.resolve({ assetId: "a1" })!;

    const first = registry.ensureLoaded(ref);
    const second = registry.ensureLoaded(ref);
    expect(fetchLogo).toHaveBeenCalledTimes(1);
    expect(fetchLogo).toHaveBeenCalledWith("a1");

    pending.resolve(logo("a1"));
    await expect(first).resolves.toBe("data:image/png;base64,bytes-a1");
    await expect(second).resolves.toBe("data:image/png;base64,bytes-a1");
    expect(registry.getDataUri("sha-a1")).toBe("data:image/png;base64,bytes-a1");

    await registry.ensureLoaded(ref);
    expect(fetchLogo).toHaveBeenCalledTimes(1);
  });

  it("swallows fetch errors and allows a retry", async () => {
    const fetchLogo = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(logo("a1"));
    const registry = new AssetLogoRegistry(fetchLogo);
    registry.setIndex([summary({ assetId: "a1" })]);
    const ref = registry.resolve({ assetId: "a1" })!;

    await expect(registry.ensureLoaded(ref)).resolves.toBeUndefined();
    await expect(registry.ensureLoaded(ref)).resolves.toBe("data:image/png;base64,bytes-a1");
  });

  it("primes bytes without fetching and notifies subscribers", () => {
    const fetchLogo = vi.fn();
    const registry = new AssetLogoRegistry(fetchLogo);
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.setIndex([summary({ assetId: "a1" })]);
    const before = registry.getSnapshot();

    registry.prime("sha-a1", "data:image/png;base64,primed");

    expect(registry.getDataUri("sha-a1")).toBe("data:image/png;base64,primed");
    expect(registry.getSnapshot()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(fetchLogo).not.toHaveBeenCalled();
  });

  it("prunes cached bytes that are no longer referenced by the index", () => {
    const registry = new AssetLogoRegistry(vi.fn());
    registry.setIndex([summary({ assetId: "a1", sha256: "sha-old" })]);
    registry.prime("sha-old", "data:image/png;base64,old");
    registry.prime("sha-new", "data:image/png;base64,new");

    registry.setIndex([summary({ assetId: "a1", sha256: "sha-new" })]);

    expect(registry.getDataUri("sha-old")).toBeUndefined();
    expect(registry.getDataUri("sha-new")).toBe("data:image/png;base64,new");

    registry.setIndex([]);
    expect(registry.getDataUri("sha-new")).toBeUndefined();
  });

  it("skips notifications when the index is unchanged", () => {
    const registry = new AssetLogoRegistry(vi.fn());
    const listener = vi.fn();
    registry.subscribe(listener);

    registry.setIndex([summary({ assetId: "a1" })]);
    registry.setIndex([summary({ assetId: "a1" })]);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("applies a refetched index whose display code or timestamp changed", () => {
    const registry = new AssetLogoRegistry(vi.fn());
    registry.setIndex([summary({ assetId: "a1", displayCode: "OLD" })]);

    registry.setIndex([summary({ assetId: "a1", displayCode: "NEW" })]);
    expect(registry.resolve({ symbol: "OLD" })).toBeUndefined();
    expect(registry.resolve({ symbol: "NEW" })?.assetId).toBe("a1");

    registry.setIndex([
      summary({ assetId: "a1", displayCode: "NEW", updatedAt: "2026-09-03T00:00:00Z" }),
    ]);
    expect(registry.resolve({ assetId: "a1" })?.updatedAt).toBe("2026-09-03T00:00:00Z");
  });

  it("load resolves then fetches for the bridge", async () => {
    const registry = new AssetLogoRegistry(vi.fn().mockResolvedValue(logo("a1")));
    registry.setIndex([summary({ assetId: "a1", displayCode: "AAPL" })]);

    await expect(registry.load({ symbol: "AAPL" })).resolves.toBe("data:image/png;base64,bytes-a1");
    await expect(registry.load({ symbol: "MSFT" })).resolves.toBeUndefined();
  });

  it("reset clears index, bytes and in-flight requests", () => {
    const pending = deferred<AssetLogo | null>();
    const fetchLogo = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(logo("a1"));
    const registry = new AssetLogoRegistry(fetchLogo);
    registry.setIndex([summary({ assetId: "a1", displayCode: "AAPL" })]);
    const ref = registry.resolve({ assetId: "a1" })!;
    void registry.ensureLoaded(ref);

    registry.reset();

    expect(registry.resolve({ assetId: "a1" })).toBeUndefined();
    expect(registry.resolve({ symbol: "AAPL" })).toBeUndefined();
    expect(registry.getDataUri("sha-a1")).toBeUndefined();

    registry.setIndex([summary({ assetId: "a1" })]);
    void registry.ensureLoaded(registry.resolve({ assetId: "a1" })!);
    expect(fetchLogo).toHaveBeenCalledTimes(2);
    pending.resolve(null);
  });
});

describe("useAssetLogoOverride", () => {
  it("returns nothing with an empty registry and no provider", () => {
    const registry = new AssetLogoRegistry(vi.fn());
    const { result } = renderHook(() => useAssetLogoOverride({ symbol: "AAPL" }, registry));

    expect(result.current).toEqual({});
  });

  it("kicks off one load and re-renders when the bytes arrive", async () => {
    const pending = deferred<AssetLogo | null>();
    const fetchLogo = vi.fn().mockReturnValue(pending.promise);
    const registry = new AssetLogoRegistry(fetchLogo);
    registry.setIndex([summary({ assetId: "a1", displayCode: "AAPL" })]);

    const { result } = renderHook(() =>
      useAssetLogoOverride({ assetId: "a1", symbol: "AAPL" }, registry),
    );

    expect(result.current.ref?.assetId).toBe("a1");
    expect(result.current.dataUri).toBeUndefined();
    expect(fetchLogo).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(logo("a1"));
      await pending.promise;
    });

    expect(result.current.dataUri).toBe("data:image/png;base64,bytes-a1");
    expect(fetchLogo).toHaveBeenCalledTimes(1);
  });

  it("does not re-render when an unrelated logo is primed", () => {
    const registry = new AssetLogoRegistry(vi.fn().mockResolvedValue(null));
    registry.setIndex([summary({ assetId: "a1", displayCode: "AAPL" })]);
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useAssetLogoOverride({ assetId: "a1" }, registry);
    });
    const before = renders;

    act(() => registry.prime("sha-other", "data:image/png;base64,other"));
    expect(renders).toBe(before);

    act(() => registry.prime("sha-a1", "data:image/png;base64,mine"));
    expect(renders).toBe(before + 1);
  });
});
