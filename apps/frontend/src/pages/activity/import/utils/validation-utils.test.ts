import { describe, expect, it } from "vitest";
import { validateTickerSymbol } from "./validation-utils";

describe("validateTickerSymbol", () => {
  it("accepts supported ticker formats", () => {
    expect(validateTickerSymbol("AAPL")).toBe(true);
    expect(validateTickerSymbol("CASH:USD")).toBe(true);
    expect(validateTickerSymbol("BRK.B")).toBe(true);
    expect(validateTickerSymbol("GOLD_KRUGERRAND")).toBe(true);
    expect(validateTickerSymbol("FUND.CLASS_A")).toBe(true);
  });

  it("accepts the full supported length", () => {
    expect(validateTickerSymbol("A".repeat(21))).toBe(true);
    expect(validateTickerSymbol("A".repeat(100))).toBe(true);
  });

  it("bounds the complete symbol", () => {
    expect(validateTickerSymbol("A".repeat(101))).toBe(false);
    expect(validateTickerSymbol(`${"A".repeat(100)}.B`)).toBe(false);
    expect(validateTickerSymbol(`${"A".repeat(98)}-${"B".repeat(50)}`)).toBe(false);
  });

  it("rejects free text and whitespace", () => {
    expect(validateTickerSymbol("bad symbol")).toBe(false);
    expect(validateTickerSymbol("Some Company Inc.")).toBe(false);
  });
});
