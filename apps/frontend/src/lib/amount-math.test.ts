import { describe, expect, it } from "vitest";
import { amountDifference, sumAmounts } from "./amount-math";

describe("amountDifference", () => {
  it.each([
    [3 * 10.1, 30.3],
    [3 * 0.1, 0.3],
    [30.3, 3 * 10.1],
    [-30.3, -3 * 10.1],
  ])("normalizes cancellation noise between %s and %s", (current, prior) => {
    expect(amountDifference(current, prior)).toBe(0);
  });

  it.each([-0.004, 0.004, -0.4, 0.4])("preserves a genuine small change (%s)", (change) => {
    expect(amountDifference(30.3 + change, 30.3)).toBeCloseTo(change, 12);
    expect(Math.sign(amountDifference(30.3 + change, 30.3))).toBe(Math.sign(change));
  });

  it("scales down with small operands rather than imposing an absolute floor", () => {
    expect(amountDifference(1e-20, 0)).toBe(1e-20);
    expect(amountDifference(0, 1e-20)).toBe(-1e-20);
  });

  it("does not turn invalid or overflowing arithmetic into zero", () => {
    expect(amountDifference(Infinity, 1)).toBe(Infinity);
    expect(amountDifference(NaN, 1)).toBeNaN();
    expect(amountDifference(1e308, -1e308)).toBe(Infinity);
  });
});

describe("sumAmounts", () => {
  it.each([
    [0.1, 0.2, -0.3],
    [-0.3, 0.1, 0.2],
    [-0.1, -0.2, 0.3],
  ])("normalizes cancelling signed amounts (%s, %s, %s)", (...values) => {
    expect(sumAmounts(values)).toBe(0);
  });

  it.each([-1e-8, 1e-8])(
    "retains a small amount between large cancelling amounts (%s)",
    (small) => {
      expect(sumAmounts([20_000_000, small, -20_000_000])).toBe(small);
      expect(sumAmounts([20_000_000, -20_000_000, small])).toBe(small);
    },
  );

  it("preserves tiny independent amounts and handles empty sums", () => {
    expect(sumAmounts([1e-20])).toBe(1e-20);
    expect(sumAmounts([-1e-20])).toBe(-1e-20);
    expect(sumAmounts([])).toBe(0);
  });

  it("preserves non-finite results instead of displaying a false zero", () => {
    expect(sumAmounts([Infinity, 1])).toBe(Infinity);
    expect(sumAmounts([Infinity, -Infinity])).toBeNaN();
    expect(sumAmounts([NaN])).toBeNaN();
  });
});
