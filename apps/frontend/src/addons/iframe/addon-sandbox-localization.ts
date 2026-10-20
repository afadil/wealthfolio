import type { CurrencyFormattingRegions, TextDirection } from "@wealthfolio/ui";

export interface AddonLocalizationSnapshot {
  locale: string;
  uiLocale?: string;
  /** The host document's reading direction, so addon surfaces mirror with it. */
  direction?: TextDirection;
  timezone?: string;
  /** Formatting regions for amounts in specific currencies, keyed by currency code. */
  currencyFormattingRegions?: CurrencyFormattingRegions;
}

type AddonLocalizationListener = (snapshot: AddonLocalizationSnapshot) => void;

const listeners = new Set<AddonLocalizationListener>();

let currentSnapshot: AddonLocalizationSnapshot = {
  locale:
    typeof navigator === "undefined"
      ? "en-US"
      : navigator.languages?.[0] || navigator.language || "en-US",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export function collectAddonLocalizationSnapshot(): AddonLocalizationSnapshot {
  return currentSnapshot;
}

export function isSameAddonLocalization(
  left: AddonLocalizationSnapshot,
  right: AddonLocalizationSnapshot,
): boolean {
  const leftRegions = left.currencyFormattingRegions ?? {};
  const rightRegions = right.currencyFormattingRegions ?? {};
  return (
    left.locale === right.locale &&
    left.uiLocale === right.uiLocale &&
    left.direction === right.direction &&
    left.timezone === right.timezone &&
    Object.keys(leftRegions).length === Object.keys(rightRegions).length &&
    Object.entries(leftRegions).every(([currency, region]) => rightRegions[currency] === region)
  );
}

export function setAddonLocalizationSnapshot(snapshot: AddonLocalizationSnapshot): void {
  if (isSameAddonLocalization(currentSnapshot, snapshot)) {
    return;
  }

  currentSnapshot = snapshot;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function subscribeToAddonLocalization(listener: AddonLocalizationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
