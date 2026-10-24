import { describe, expect, it } from "vitest";
import { inheritedLoanSettings } from "./loan-event-editing";

describe("inherited renewal settings", () => {
  const metadata = {
    loan_projection: {
      version: 1,
      annualRate: 4,
      paymentAmount: 500,
      frequency: "monthly",
      firstPaymentDate: "2025-02-01",
      interestMethod: "semiannual",
    },
    loan_events: [
      { type: "payment_frequency_change", effectiveDate: "2026-01-01", frequency: "biweekly" },
      { type: "renewal", effectiveDate: "2026-01-01", annualRate: 3 },
      {
        type: "renewal",
        effectiveDate: "2026-01-01",
        annualRate: 2,
        interestMethod: "monthly",
        frequency: "accelerated_biweekly",
      },
    ],
  };
  it("inherits preceding settings without using the edited or later same-day renewal", () => {
    expect(inheritedLoanSettings(metadata, 1, "2026-01-01")).toEqual({
      frequency: "biweekly",
      interestMethod: "semiannual",
      annualRate: 4,
    });
  });
  it("resolves inheritance again when the effective date moves", () => {
    expect(inheritedLoanSettings(metadata, 1, "2025-12-01")).toEqual({
      frequency: "monthly",
      interestMethod: "semiannual",
      annualRate: 4,
    });
    expect(inheritedLoanSettings(metadata, 1, "2026-02-01")).toEqual({
      frequency: "accelerated_biweekly",
      interestMethod: "monthly",
      annualRate: 2,
    });
  });
});

it("keeps recorded same-day ordering when an out-of-order event is moved", () => {
  const metadata = {
    loan_projection: {
      version: 1,
      annualRate: 4,
      paymentAmount: 500,
      frequency: "monthly",
      firstPaymentDate: "2025-02-01",
    },
    loan_events: [
      { type: "renewal", effectiveDate: "2026-02-01", annualRate: 3 },
      {
        type: "renewal",
        effectiveDate: "2026-01-01",
        annualRate: 2,
        interestMethod: "semiannual",
        frequency: "biweekly",
      },
    ],
  };
  // Moving the first recorded event onto January 1 still puts it before its sibling.
  expect(inheritedLoanSettings(metadata, 1, "2026-01-01")).toEqual({
    frequency: "monthly",
    interestMethod: "nominal_periodic",
    annualRate: 4,
  });
});

it("new backdated renewals inherit the selected date's settings, including earlier same-day events", () => {
  const metadata = {
    loan_projection: {
      version: 1,
      annualRate: 4,
      paymentAmount: 100,
      frequency: "monthly",
      firstPaymentDate: "2026-02-01",
      interestMethod: "semiannual",
    },
    loan_events: [
      {
        type: "renewal",
        effectiveDate: "2026-06-10",
        annualRate: 3,
        frequency: "biweekly",
        interestMethod: "monthly",
      },
    ],
  };
  expect(inheritedLoanSettings(metadata, -1, "2026-03-10")).toEqual({
    frequency: "monthly",
    interestMethod: "semiannual",
    annualRate: 4,
  });
  expect(inheritedLoanSettings(metadata, -1, "2026-06-10")).toEqual({
    frequency: "biweekly",
    interestMethod: "monthly",
    annualRate: 3,
  });
});

it("a new rate change sees the rate in effect on its date", () => {
  const metadata = {
    loan_projection: {
      version: 1,
      annualRate: 4,
      paymentAmount: 100,
      frequency: "monthly",
      firstPaymentDate: "2026-02-01",
    },
    loan_events: [
      { type: "rate_change", effectiveDate: "2026-03-01", annualRate: 5 },
      { type: "renewal", effectiveDate: "2026-05-01", annualRate: 3.5 },
      { type: "rate_change", effectiveDate: "2026-05-01", annualRate: 3.25 },
    ],
  };
  const rateOn = (date: string) => inheritedLoanSettings(metadata, -1, date).annualRate;
  expect(rateOn("2026-02-15")).toBe(4);
  expect(rateOn("2026-03-01")).toBe(5);
  expect(rateOn("2026-04-30")).toBe(5);
  // The later same-day entry wins, as in the calculation.
  expect(rateOn("2026-05-01")).toBe(3.25);
});
