import { useEffect, useSyncExternalStore } from "react";

import { getAssetLogo } from "@/adapters";
import type { AssetLogo, AssetLogoSummary } from "@/lib/types";

/**
 * In-memory index of custom asset logos, shared by every `TickerAvatar` and
 * the addon sandbox bridge.
 *
 * Deliberately not react-query: avatars render in tests without a
 * `QueryClientProvider`, 20-50 of them per table must not each own a query,
 * and the bridge is plain TypeScript. `AssetLogoRegistrySync` feeds the index
 * from react-query once at app start (and after invalidations); image bytes
 * are fetched lazily, once per content hash, when an avatar first needs them.
 */

export interface AssetLogoRef {
  assetId: string;
  displayCode: string | null;
  sha256: string;
  updatedAt: string;
}

export interface AssetLogoLookup {
  assetId?: string | null;
  symbol?: string | null;
}

type Listener = () => void;
type LogoFetcher = (assetId: string) => Promise<AssetLogo | null>;

const toDataUri = (logo: AssetLogo) => `data:${logo.mimeType};base64,${logo.dataBase64}`;

export class AssetLogoRegistry {
  private byAssetId = new Map<string, AssetLogoRef>();
  private bySymbol = new Map<string, AssetLogoRef>();
  private dataBySha = new Map<string, string>();
  private inFlight = new Map<string, Promise<string | undefined>>();
  private listeners = new Set<Listener>();
  private version = 0;
  private indexSignature = "";

  // Lazy default so partially mocked `@/adapters` modules in tests never touch `getAssetLogo`.
  constructor(private readonly fetchLogo: LogoFetcher = (assetId) => getAssetLogo(assetId)) {}

  /** Replace the index. `bySymbol` only maps display codes owned by exactly one override. */
  setIndex(summaries: readonly AssetLogoSummary[]): void {
    const signature = summaries
      .map((s) => `${s.assetId}:${s.sha256}:${s.displayCode ?? ""}:${s.updatedAt}`)
      .join("|");
    if (signature === this.indexSignature) return;
    this.indexSignature = signature;

    this.byAssetId = new Map();
    const symbolCounts = new Map<string, number>();
    for (const summary of summaries) {
      const ref: AssetLogoRef = {
        assetId: summary.assetId,
        displayCode: summary.displayCode,
        sha256: summary.sha256,
        updatedAt: summary.updatedAt,
      };
      this.byAssetId.set(summary.assetId, ref);
      const code = summary.displayCode?.trim().toUpperCase();
      if (code) symbolCounts.set(code, (symbolCounts.get(code) ?? 0) + 1);
    }

    this.bySymbol = new Map();
    for (const ref of this.byAssetId.values()) {
      const code = ref.displayCode?.trim().toUpperCase();
      if (code && symbolCounts.get(code) === 1) this.bySymbol.set(code, ref);
    }

    const activeHashes = new Set(summaries.map((summary) => summary.sha256));
    for (const sha256 of this.dataBySha.keys()) {
      if (!activeHashes.has(sha256)) this.dataBySha.delete(sha256);
    }

    this.notify();
  }

  /** Asset ids are authoritative; symbol fallback is only for callers without an asset id. */
  resolve({ assetId, symbol }: AssetLogoLookup): AssetLogoRef | undefined {
    if (assetId) return this.byAssetId.get(assetId);
    const code = symbol?.trim().toUpperCase();
    return code ? this.bySymbol.get(code) : undefined;
  }

  getDataUri(sha256: string): string | undefined {
    return this.dataBySha.get(sha256);
  }

  /** Fetch the bytes for a ref once per hash; concurrent callers share the request. */
  ensureLoaded(ref: AssetLogoRef): Promise<string | undefined> {
    const cached = this.dataBySha.get(ref.sha256);
    if (cached) return Promise.resolve(cached);

    const pending = this.inFlight.get(ref.sha256);
    if (pending) return pending;

    // Executor form: the fetcher runs synchronously (dedupe stays observable) and a sync throw rejects.
    const request = new Promise<AssetLogo | null>((resolve) => resolve(this.fetchLogo(ref.assetId)))
      .then((logo) => {
        if (!logo) return undefined;
        const dataUri = toDataUri(logo);
        this.prime(logo.sha256, dataUri);
        if (logo.sha256 !== ref.sha256) this.prime(ref.sha256, dataUri);
        return dataUri;
      })
      .catch(() => undefined)
      .finally(() => {
        this.inFlight.delete(ref.sha256);
      });
    this.inFlight.set(ref.sha256, request);
    return request;
  }

  /** Store bytes we already have (e.g. right after an upload). */
  prime(sha256: string, dataUri: string): void {
    if (this.dataBySha.get(sha256) === dataUri) return;
    this.dataBySha.set(sha256, dataUri);
    this.notify();
  }

  /** Non-React entry point (addon bridge): resolve + load in one call. */
  load(lookup: AssetLogoLookup): Promise<string | undefined> {
    const ref = this.resolve(lookup);
    return ref ? this.ensureLoaded(ref) : Promise.resolve(undefined);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): number => this.version;

  reset(): void {
    this.byAssetId = new Map();
    this.bySymbol = new Map();
    this.dataBySha = new Map();
    this.inFlight = new Map();
    this.indexSignature = "";
    this.notify();
  }

  private notify() {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

export const assetLogoRegistry = new AssetLogoRegistry();

export interface AssetLogoOverride {
  ref?: AssetLogoRef;
  dataUri?: string;
}

/**
 * Synchronous lookup of a custom logo for an avatar. Returns nothing while the
 * registry is empty (tests, pre-login), so it needs no provider.
 */
export function useAssetLogoOverride(
  lookup: AssetLogoLookup,
  registry: AssetLogoRegistry = assetLogoRegistry,
): AssetLogoOverride {
  // Per-lookup snapshot so a change to an unrelated logo does not re-render this avatar.
  const getSnapshot = () => {
    const r = registry.resolve(lookup);
    return r ? `${r.sha256}:${registry.getDataUri(r.sha256) ? 1 : 0}` : "";
  };
  useSyncExternalStore(registry.subscribe, getSnapshot, getSnapshot);

  const ref = registry.resolve(lookup);
  const dataUri = ref ? registry.getDataUri(ref.sha256) : undefined;

  useEffect(() => {
    if (ref && !dataUri) void registry.ensureLoaded(ref);
  }, [ref, dataUri, registry]);

  return ref ? { ref, dataUri } : {};
}
