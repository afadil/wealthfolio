// @vitest-environment jsdom
import type { LoggerAPI } from "@wealthfolio/addon-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchYahooDividends, toYahooSymbol } from "./yahoo-dividends";

describe("toYahooSymbol", () => {
  it("returns symbol unchanged when no MIC provided", () => {
    expect(toYahooSymbol("AAPL")).toBe("AAPL");
  });

  it("returns symbol unchanged when MIC is null", () => {
    expect(toYahooSymbol("AAPL", null)).toBe("AAPL");
  });

  it("returns symbol unchanged when MIC is undefined", () => {
    expect(toYahooSymbol("AAPL", undefined)).toBe("AAPL");
  });

  it("returns symbol unchanged for unknown MIC", () => {
    expect(toYahooSymbol("XYZ", "UNKNOWN_MIC")).toBe("XYZ");
  });

  it("appends .TO for XTSE (Toronto)", () => {
    expect(toYahooSymbol("RY", "XTSE")).toBe("RY.TO");
  });

  it("appends .L for XLON (London)", () => {
    expect(toYahooSymbol("SHEL", "XLON")).toBe("SHEL.L");
  });

  it("appends .DE for XETR (Frankfurt/Xetra)", () => {
    expect(toYahooSymbol("SAP", "XETR")).toBe("SAP.DE");
  });

  it("appends .HK for XHKG (Hong Kong)", () => {
    expect(toYahooSymbol("0700", "XHKG")).toBe("0700.HK");
  });

  it("appends .SA for BVMF (Brazil)", () => {
    expect(toYahooSymbol("PETR4", "BVMF")).toBe("PETR4.SA");
  });

  it("appends .T for XTKS (Tokyo)", () => {
    expect(toYahooSymbol("7203", "XTKS")).toBe("7203.T");
  });

  it("appends .AX for XASX (Australia)", () => {
    expect(toYahooSymbol("BHP", "XASX")).toBe("BHP.AX");
  });

  it("appends .PA for XPAR (Paris)", () => {
    expect(toYahooSymbol("MC", "XPAR")).toBe("MC.PA");
  });

  it("appends .SW for XSWX (Switzerland)", () => {
    expect(toYahooSymbol("NESN", "XSWX")).toBe("NESN.SW");
  });
});

describe("fetchYahooDividends", () => {
  const mockLogger: LoggerAPI = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TAURI__;
  });

  it("throws when Tauri invoke is not available", async () => {
    await expect(fetchYahooDividends("AAPL", mockLogger)).rejects.toThrow(
      "Tauri invoke not available",
    );
    expect(mockLogger.error).toHaveBeenCalledWith("Tauri invoke not available");
  });

  it("calls Tauri invoke with correct command and symbol", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([]);
    (globalThis as Record<string, unknown>).__TAURI__ = {
      core: { invoke: mockInvoke },
    };

    await fetchYahooDividends("AAPL.TO", mockLogger);

    expect(mockInvoke).toHaveBeenCalledWith("fetch_yahoo_dividends", {
      symbol: "AAPL.TO",
    });
  });

  it("returns dividend data on success", async () => {
    const dividends = [
      { amount: 0.25, date: 1718841600 },
      { amount: 0.25, date: 1726704000 },
    ];
    const mockInvoke = vi.fn().mockResolvedValue(dividends);
    (globalThis as Record<string, unknown>).__TAURI__ = {
      core: { invoke: mockInvoke },
    };

    const result = await fetchYahooDividends("AAPL", mockLogger);

    expect(result).toEqual(dividends);
    expect(mockLogger.debug).toHaveBeenCalledWith("Found 2 dividends for AAPL");
  });

  it("propagates error when invoke throws", async () => {
    const mockInvoke = vi.fn().mockRejectedValue(new Error("Network error"));
    (globalThis as Record<string, unknown>).__TAURI__ = {
      core: { invoke: mockInvoke },
    };

    await expect(fetchYahooDividends("AAPL", mockLogger)).rejects.toThrow("Network error");
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to fetch dividends for AAPL: Error: Network error",
    );
  });

  it("logs debug message before fetching", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([]);
    (globalThis as Record<string, unknown>).__TAURI__ = {
      core: { invoke: mockInvoke },
    };

    await fetchYahooDividends("RY.TO", mockLogger);

    expect(mockLogger.debug).toHaveBeenCalledWith("Fetching dividends for RY.TO");
  });
});
