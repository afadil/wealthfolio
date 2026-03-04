import { normalizeInstrumentType, splitInstrumentPrefixedSymbol } from "./instrument-type";

describe("normalizeInstrumentType", () => {
  it("returns undefined for null/undefined/empty", () => {
    expect(normalizeInstrumentType(undefined)).toBeUndefined();
    expect(normalizeInstrumentType(null)).toBeUndefined();
    expect(normalizeInstrumentType("")).toBeUndefined();
    expect(normalizeInstrumentType("   ")).toBeUndefined();
  });

  it("normalizes canonical types", () => {
    expect(normalizeInstrumentType("EQUITY")).toBe("EQUITY");
    expect(normalizeInstrumentType("BOND")).toBe("BOND");
    expect(normalizeInstrumentType("OPTION")).toBe("OPTION");
    expect(normalizeInstrumentType("CRYPTO")).toBe("CRYPTO");
    expect(normalizeInstrumentType("FX")).toBe("FX");
    expect(normalizeInstrumentType("METAL")).toBe("METAL");
  });

  it("normalizes aliases to canonical types", () => {
    // Equity aliases
    expect(normalizeInstrumentType("STOCK")).toBe("EQUITY");
    expect(normalizeInstrumentType("ETF")).toBe("EQUITY");
    expect(normalizeInstrumentType("MUTUALFUND")).toBe("EQUITY");
    expect(normalizeInstrumentType("MUTUAL_FUND")).toBe("EQUITY");
    expect(normalizeInstrumentType("INDEX")).toBe("EQUITY");

    // Bond aliases
    expect(normalizeInstrumentType("FIXEDINCOME")).toBe("BOND");
    expect(normalizeInstrumentType("FIXED_INCOME")).toBe("BOND");
    expect(normalizeInstrumentType("DEBT")).toBe("BOND");

    // Other aliases
    expect(normalizeInstrumentType("OPT")).toBe("OPTION");
    expect(normalizeInstrumentType("CRYPTOCURRENCY")).toBe("CRYPTO");
    expect(normalizeInstrumentType("FOREX")).toBe("FX");
    expect(normalizeInstrumentType("CURRENCY")).toBe("FX");
    expect(normalizeInstrumentType("COMMODITY")).toBe("METAL");
  });

  it("is case-insensitive", () => {
    expect(normalizeInstrumentType("bond")).toBe("BOND");
    expect(normalizeInstrumentType("Bond")).toBe("BOND");
    expect(normalizeInstrumentType("fixed_income")).toBe("BOND");
    expect(normalizeInstrumentType("equity")).toBe("EQUITY");
  });

  it("handles whitespace and hyphens", () => {
    expect(normalizeInstrumentType("  BOND  ")).toBe("BOND");
    expect(normalizeInstrumentType("FIXED INCOME")).toBe("BOND");
    expect(normalizeInstrumentType("fixed-income")).toBe("BOND");
    expect(normalizeInstrumentType("MUTUAL FUND")).toBe("EQUITY");
    expect(normalizeInstrumentType("mutual-fund")).toBe("EQUITY");
  });

  it("returns undefined for unrecognized types", () => {
    expect(normalizeInstrumentType("REAL_ESTATE")).toBeUndefined();
    expect(normalizeInstrumentType("UNKNOWN")).toBeUndefined();
    expect(normalizeInstrumentType("FUTURES")).toBeUndefined();
  });
});

describe("splitInstrumentPrefixedSymbol", () => {
  it("returns undefined symbol for null/undefined/empty", () => {
    expect(splitInstrumentPrefixedSymbol(undefined)).toEqual({
      symbol: undefined,
    });
    expect(splitInstrumentPrefixedSymbol("")).toEqual({ symbol: undefined });
    expect(splitInstrumentPrefixedSymbol("   ")).toEqual({
      symbol: undefined,
    });
  });

  it("returns plain symbol when no prefix", () => {
    expect(splitInstrumentPrefixedSymbol("AAPL")).toEqual({ symbol: "AAPL" });
    expect(splitInstrumentPrefixedSymbol("US912828ZT58")).toEqual({
      symbol: "US912828ZT58",
    });
    expect(splitInstrumentPrefixedSymbol("BTC-USD")).toEqual({
      symbol: "BTC-USD",
    });
  });

  it("splits recognized prefixed symbols", () => {
    expect(splitInstrumentPrefixedSymbol("bond:US912828ZT58")).toEqual({
      symbol: "US912828ZT58",
      instrumentType: "BOND",
    });
    expect(splitInstrumentPrefixedSymbol("option:AAPL260918C00200000")).toEqual({
      symbol: "AAPL260918C00200000",
      instrumentType: "OPTION",
    });
    expect(splitInstrumentPrefixedSymbol("crypto:BTC-USD")).toEqual({
      symbol: "BTC-USD",
      instrumentType: "CRYPTO",
    });
    expect(splitInstrumentPrefixedSymbol("equity:MSFT")).toEqual({
      symbol: "MSFT",
      instrumentType: "EQUITY",
    });
  });

  it("handles spacing around colon", () => {
    expect(splitInstrumentPrefixedSymbol("bond : US912828ZT58")).toEqual({
      symbol: "US912828ZT58",
      instrumentType: "BOND",
    });
  });

  it("treats unrecognized prefix as plain symbol", () => {
    expect(splitInstrumentPrefixedSymbol("futures:CL2412")).toEqual({
      symbol: "futures:CL2412",
    });
  });

  it("does not split on colons that are part of the symbol", () => {
    // A very long prefix (>20 chars) should not match
    expect(
      splitInstrumentPrefixedSymbol("thisisaverylongprefixthatisover20:XYZ"),
    ).toEqual({ symbol: "thisisaverylongprefixthatisover20:XYZ" });
  });
});
