import { assetLogoRegistry, type AssetLogoRegistry } from "@/lib/asset-logo-registry";
import { normalizeTickerLogoSymbol, resolveTickerLogoFilenames } from "@wealthfolio/ui";

export {
  normalizeTickerLogoSymbol,
  resolveTickerLogoFilename,
  resolveTickerLogoFilenames,
} from "@wealthfolio/ui";

const MAX_TICKER_LOGO_BYTES = 512 * 1024;
const DEFAULT_CACHE_SIZE = 256;

function dataUriToBlob(dataUri: string): Blob {
  const [header, payload = ""] = dataUri.split(",", 2);
  const mimeType = header.slice("data:".length).split(";", 1)[0] || "image/png";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export class TickerLogoAssetBridge {
  private readonly cache = new Map<string, Blob | null>();
  private readonly pending = new Map<string, Promise<Blob | null>>();

  constructor(
    private readonly fetchAsset: typeof fetch = fetch,
    private readonly maxEntries = DEFAULT_CACHE_SIZE,
    private readonly registry: AssetLogoRegistry = assetLogoRegistry,
  ) {}

  load(symbol: unknown, exchangeMic?: unknown, instrumentType?: unknown): Promise<Blob | null> {
    const normalized = normalizeTickerLogoSymbol(symbol);
    const filenames = resolveTickerLogoFilenames(symbol, exchangeMic, instrumentType);
    if (!normalized || filenames.length === 0) {
      return Promise.resolve(null);
    }

    // Custom logos are consulted before the bundled LRU on every call, including
    // the base-symbol fallback historically performed by SandboxTickerAvatar.
    // Limitation: an already mounted avatar only picks up a new upload on remount
    // (host→sandbox broadcast is a follow-up).
    const fallbackFilename = filenames.length > 1 ? filenames.at(-1) : undefined;
    const fallbackSymbol = fallbackFilename?.replace(/^crypto\//, "");
    const customSymbols = [normalized, fallbackSymbol].filter(
      (candidate, index, candidates): candidate is string =>
        !!candidate && candidates.indexOf(candidate) === index,
    );
    return this.loadCustomCandidates(customSymbols).then(
      (logo) => logo ?? this.loadBundledCandidates(filenames),
    );
  }

  private async loadCustomCandidates(symbols: string[]): Promise<Blob | null> {
    for (const symbol of symbols) {
      const uri = await this.registry.load({ symbol });
      if (uri) return dataUriToBlob(uri);
    }
    return null;
  }

  private async loadBundledCandidates(filenames: string[]): Promise<Blob | null> {
    for (const filename of filenames) {
      const logo = await this.loadBundled(filename);
      if (logo) return logo;
    }
    return null;
  }

  private loadBundled(filename: string): Promise<Blob | null> {
    const cached = this.cache.get(filename);
    if (cached !== undefined) {
      this.cache.delete(filename);
      this.cache.set(filename, cached);
      return Promise.resolve(cached);
    }

    const inFlight = this.pending.get(filename);
    if (inFlight) {
      return inFlight;
    }

    const request = this.fetchLogo(filename).finally(() => {
      this.pending.delete(filename);
    });
    this.pending.set(filename, request);
    return request;
  }

  get cacheSize() {
    return this.cache.size;
  }

  private async fetchLogo(symbol: string): Promise<Blob | null> {
    try {
      const basePath = import.meta.env.BASE_URL || "/";
      const url = new URL(
        `${basePath.replace(/\/?$/, "/")}ticker-logos/${symbol
          .split("/")
          .map(encodeURIComponent)
          .join("/")}.png`,
        window.location.href,
      );
      // WebKit brand-checks Window.fetch; a normal class-field call uses this bridge as receiver.
      const response = await this.fetchAsset.call(globalThis, url, { cache: "no-cache" });
      const contentLength = Number(response.headers.get("content-length") || "0");
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (
        !response.ok ||
        contentType !== "image/png" ||
        (contentLength > 0 && contentLength > MAX_TICKER_LOGO_BYTES)
      ) {
        if (response.status === 404 || response.ok) {
          this.remember(symbol, null);
        }
        return null;
      }

      const blob = await response.blob();
      if (blob.type.toLowerCase() !== "image/png" || blob.size > MAX_TICKER_LOGO_BYTES) {
        this.remember(symbol, null);
        return null;
      }

      this.remember(symbol, blob);
      return blob;
    } catch {
      return null;
    }
  }

  private remember(symbol: string, value: Blob | null) {
    this.cache.delete(symbol);
    this.cache.set(symbol, value);
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (!oldest) {
        break;
      }
      this.cache.delete(oldest);
    }
  }
}

export const tickerLogoAssetBridge = new TickerLogoAssetBridge();
