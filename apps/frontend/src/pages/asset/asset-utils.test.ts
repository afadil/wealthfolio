import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetKind } from "@/lib/constants";
import type { Asset } from "@/lib/types";
import { isExpiredOptionAsset } from "./asset-utils";

const makeAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset-1",
  kind: AssetKind.INVESTMENT,
  name: "Option",
  displayCode: "TSLA260426C00397500",
  quoteMode: "MARKET",
  quoteCcy: "USD",
  instrumentType: "OPTION",
  instrumentSymbol: "TSLA260426C00397500",
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isExpiredOptionAsset", () => {
  it("uses the configured timezone for the current date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T01:00:00Z"));

    const asset = makeAsset({
      metadata: {
        option: {
          expiration: "2026-04-26",
        },
      },
    });

    expect(isExpiredOptionAsset(asset, "America/Los_Angeles")).toBe(false);
    expect(isExpiredOptionAsset(asset, "UTC")).toBe(true);
  });

  it("falls back to the OCC symbol when metadata is missing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));

    expect(isExpiredOptionAsset(makeAsset(), "UTC")).toBe(true);
  });

  it("ignores non-option assets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));

    expect(
      isExpiredOptionAsset(
        makeAsset({
          instrumentType: "EQUITY",
          metadata: {
            option: {
              expiration: "2026-04-26",
            },
          },
        }),
        "UTC",
      ),
    ).toBe(false);
  });
});
