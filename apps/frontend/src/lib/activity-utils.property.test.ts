//! Property-based tests for activity-utils.
//!
//! Technique: fast-check — TypeScript port of QuickCheck.
//! https://fast-check.io/
//!
//! Rule: pure utility functions must be "total" — they must not throw,
//! return NaN, or behave inconsistently for any input in their declared domain.

import * as fc from "fast-check";
import { isCashSymbol, isCashActivity, isIncomeActivity, isTradeActivity } from "./activity-utils";
import { ActivityType } from "./constants";

const ALL_ACTIVITY_TYPES = Object.values(ActivityType);

// ─── isCashSymbol ─────────────────────────────────────────────────────────────

describe("isCashSymbol — property tests", () => {
  it("never throws for any string input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => isCashSymbol(s)).not.toThrow();
      }),
    );
  });

  it("always returns a boolean", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = isCashSymbol(s);
        expect(typeof result).toBe("boolean");
      }),
    );
  });

  it("handles undefined gracefully", () => {
    expect(() => isCashSymbol(undefined)).not.toThrow();
    expect(isCashSymbol(undefined)).toBe(false);
  });

  // isCashSymbol uses the /i flag — currency codes match regardless of case
  it("recognises all CASH:{CCC} patterns (3 letters, any case)", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z]{3}$/), (currency) => {
        expect(isCashSymbol(`CASH:${currency}`)).toBe(true);
      }),
    );
  });

  it("rejects CASH: with non-3-letter suffix", () => {
    fc.assert(
      fc.property(
        // Exclude exactly-3-letter strings; they match due to /i flag in isCashSymbol
        fc.string({ minLength: 1 }).filter((s) => !/^[A-Za-z]{3}$/.test(s)),
        (bad) => {
          expect(isCashSymbol(`CASH:${bad}`)).toBe(false);
        },
      ),
    );
  });
});

// ─── isCashActivity / isIncomeActivity / isTradeActivity ─────────────────────

describe("activity type predicates — property tests", () => {
  it("isCashActivity never throws for any string", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => isCashActivity(s)).not.toThrow();
      }),
    );
  });

  it("isIncomeActivity never throws for any string", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => isIncomeActivity(s)).not.toThrow();
      }),
    );
  });

  it("isTradeActivity never throws for any string", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => isTradeActivity(s)).not.toThrow();
      }),
    );
  });

  it("exactly BUY and SELL are trade activities (exhaustive)", () => {
    for (const type of ALL_ACTIVITY_TYPES) {
      const expected = type === ActivityType.BUY || type === ActivityType.SELL;
      expect(isTradeActivity(type)).toBe(expected);
    }
  });

  it("predicates are mutually consistent: trade activities are never income", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_ACTIVITY_TYPES), (type) => {
        if (isTradeActivity(type)) {
          expect(isIncomeActivity(type)).toBe(false);
        }
      }),
    );
  });
});
