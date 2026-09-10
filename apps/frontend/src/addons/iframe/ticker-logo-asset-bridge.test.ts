import { describe, expect, it, vi } from "vitest";
import { AssetLogoRegistry } from "@/lib/asset-logo-registry";
import type { AssetLogo } from "@/lib/types";
import {
  normalizeTickerLogoSymbol,
  resolveTickerLogoFilename,
  resolveTickerLogoFilenames,
  TickerLogoAssetBridge,
} from "./ticker-logo-asset-bridge";

vi.mock("@/adapters", () => ({ getAssetLogo: vi.fn() }));

function customLogo(assetId: string, bytes: string): AssetLogo {
  return {
    assetId,
    mimeType: "image/png",
    dataBase64: btoa(bytes),
    sha256: `sha-${assetId}-${bytes}`,
    width: 256,
    height: 256,
    createdAt: "2026-09-02T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
  };
}

function registryWith(assetId: string, displayCode: string, bytes: string) {
  const logo = customLogo(assetId, bytes);
  const registry = new AssetLogoRegistry(vi.fn().mockResolvedValue(logo));
  registry.setIndex([
    {
      assetId,
      displayCode,
      sha256: logo.sha256,
      updatedAt: logo.updatedAt,
    },
  ]);
  return registry;
}

function pngResponse(content = "png", headers: Record<string, string> = {}) {
  return new Response(new Blob([content], { type: "image/png" }), {
    headers: { "content-type": "image/png", ...headers },
    status: 200,
  });
}

describe("TickerLogoAssetBridge", () => {
  it("normalizes symbols and rejects traversal or path separators", () => {
    expect(normalizeTickerLogoSymbol(" brk.b ")).toBe("BRK.B");
    expect(normalizeTickerLogoSymbol("$cash-usd")).toBe("$CASH-USD");
    expect(normalizeTickerLogoSymbol("../secret")).toBeUndefined();
    expect(normalizeTickerLogoSymbol("foo/bar")).toBeUndefined();
    expect(normalizeTickerLogoSymbol("foo\\bar")).toBeUndefined();
  });

  it("resolves exchange MICs, provider suffixes, and share classes", () => {
    expect(resolveTickerLogoFilename("SHOP", "XTSE")).toBe("SHOP-XTSE");
    expect(resolveTickerLogoFilename("SHOP.TO")).toBe("SHOP-TO");
    expect(resolveTickerLogoFilename("BRK.B", "XNYS")).toBe("BRK-B-XNYS");
    expect(resolveTickerLogoFilename("SHOP-XTSE")).toBe("SHOP-XTSE");
    expect(resolveTickerLogoFilenames("SHOP", "XTSE")).toEqual(["SHOP-XTSE", "SHOP"]);
    expect(resolveTickerLogoFilenames("SHOP.TO")).toEqual(["SHOP-TO", "SHOP-XTSE", "SHOP"]);
    expect(resolveTickerLogoFilenames("HEIA.AS")).toEqual(["HEIA-AS", "HEIA-XAMS", "HEIA"]);
    expect(resolveTickerLogoFilenames("BRK.B")).toEqual(["BRK-B"]);
    expect(resolveTickerLogoFilenames("BRK.B", "XNYS")).toEqual(["BRK-B-XNYS", "BRK-B"]);
    expect(resolveTickerLogoFilenames("BTC", null, "CRYPTO")).toEqual(["crypto/BTC"]);
    expect(resolveTickerLogoFilenames("BTC-USD", null, "CRYPTOCURRENCY")).toEqual([
      "crypto/BTC-USD",
      "crypto/BTC",
    ]);
  });

  it("deduplicates concurrent requests and bounds the Blob LRU", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(pngResponse()));
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch, 2);

    const [first, second] = await Promise.all([bridge.load("AAPL"), bridge.load("AAPL")]);
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await bridge.load("MSFT");
    await bridge.load("GOOG");
    expect(bridge.cacheSize).toBe(2);
    await bridge.load("AAPL");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("calls Window.fetch with the Window receiver required by WebKit", async () => {
    const fetchMock = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Window.fetch called with an invalid receiver");
      }
      return Promise.resolve(pngResponse());
    });
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch);

    await expect(bridge.load("AAPL")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns null for missing, non-PNG, and oversized responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response("text", { headers: { "content-type": "text/plain" }, status: 200 }),
      )
      .mockResolvedValueOnce(pngResponse("small", { "content-length": String(512 * 1024 + 1) }));
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch);

    await expect(bridge.load("MISSING")).resolves.toBeNull();
    await expect(bridge.load("TEXT")).resolves.toBeNull();
    await expect(bridge.load("HUGE")).resolves.toBeNull();
  });

  it("caches misses in the bounded LRU and retries transient failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(pngResponse("msft"))
      .mockResolvedValueOnce(pngResponse("goog"))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch, 2);

    await expect(bridge.load("MISSING")).resolves.toBeNull();
    await expect(bridge.load("MISSING")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await bridge.load("MSFT");
    await bridge.load("GOOG");
    expect(bridge.cacheSize).toBe(2);
    await expect(bridge.load("MISSING")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const transientFetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(pngResponse("recovered"));
    const retryingBridge = new TickerLogoAssetBridge(transientFetch as unknown as typeof fetch);
    await expect(retryingBridge.load("RETRY")).resolves.toBeNull();
    await expect(retryingBridge.load("RETRY")).resolves.toBeInstanceOf(Blob);
    expect(transientFetch).toHaveBeenCalledTimes(2);
  });

  it("serves a custom logo from the registry without fetching the bundled file", async () => {
    const fetchMock = vi.fn();
    const registry = registryWith("a1", "AAPL", "custom-bytes");
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch, 2, registry);

    const blob = await bridge.load("aapl");

    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("image/png");
    await expect(blob!.text()).resolves.toBe("custom-bytes");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bridge.cacheSize).toBe(0);

    // Decoded again from the registry's cached bytes: same content, still no fetch.
    const again = await bridge.load("AAPL");
    expect(again?.size).toBe(blob?.size);
    expect(again?.type).toBe("image/png");
    await expect(again!.text()).resolves.toBe("custom-bytes");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a base-symbol custom logo for a provider-formatted addon symbol", async () => {
    const fetchMock = vi.fn();
    const registry = registryWith("shop", "SHOP", "custom-shop");
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch, 2, registry);

    const logo = await bridge.load("SHOP.TO");

    expect(logo).toBeInstanceOf(Blob);
    await expect(logo!.text()).resolves.toBe("custom-shop");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat an unsupported hyphen suffix as a custom-logo base symbol", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(pngResponse("bundled")));
    const registry = registryWith("brk", "BRK", "wrong-custom");
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch, 2, registry);

    const logo = await bridge.load("BRK-B");

    expect(logo).toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticker-logos/BRK-B.png");
  });

  it("shows a new override without evicting the bundled cache", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(pngResponse("bundled")));
    const registry = new AssetLogoRegistry(vi.fn().mockResolvedValue(customLogo("a1", "override")));
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch, 2, registry);

    const bundled = await bridge.load("AAPL");
    expect(bundled).toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    registry.setIndex([
      {
        assetId: "a1",
        displayCode: "AAPL",
        sha256: "sha-a1-override",
        updatedAt: "2026-09-02T00:00:00Z",
      },
    ]);

    const override = await bridge.load("AAPL");
    await expect(override!.text()).resolves.toBe("override");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bridge.cacheSize).toBe(1);

    // Reset → straight back to the cached bundled Blob, still no refetch.
    registry.reset();
    await expect(bridge.load("AAPL")).resolves.toBe(bundled);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the bundled path when no override exists for the symbol", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(pngResponse()));
    const registry = registryWith("a1", "AAPL", "custom");
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch, 2, registry);

    await expect(bridge.load("MSFT")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticker-logos/MSFT.png");
  });

  it("fetches the canonical market filename", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(pngResponse()));
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch);

    await expect(bridge.load("SHOP", "XTSE")).resolves.toBeInstanceOf(Blob);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticker-logos/SHOP-XTSE.png");
  });

  it("preserves symbol-only addon compatibility for provider-formatted symbols", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(pngResponse());
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch);

    await expect(bridge.load("SHOP.TO")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticker-logos/SHOP-TO.png");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/ticker-logos/SHOP-XTSE.png");
  });

  it("falls back from the market filename to the unsuffixed filename", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(pngResponse());
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch);

    await expect(bridge.load("SHOP", "XTSE")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticker-logos/SHOP-XTSE.png");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/ticker-logos/SHOP.png");
  });

  it("loads crypto from its namespace without an equity fallback", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(pngResponse()));
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch);

    await expect(bridge.load("BTC", null, "CRYPTO")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticker-logos/crypto/BTC.png");
  });

  it("accepts the cryptocurrency quote type returned by symbol search", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(pngResponse()));
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch);

    await expect(bridge.load("BTC", null, "CRYPTOCURRENCY")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticker-logos/crypto/BTC.png");
  });

  it("falls back from a provider-formatted crypto symbol to its canonical base", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(pngResponse());
    const bridge = new TickerLogoAssetBridge(fetchMock as unknown as typeof fetch);

    await expect(bridge.load("BTC-USD", null, "CRYPTOCURRENCY")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticker-logos/crypto/BTC-USD.png");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/ticker-logos/crypto/BTC.png");
  });
});
