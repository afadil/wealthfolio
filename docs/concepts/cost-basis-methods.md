<!-- Draft for wealthfolio.app/docs/concepts/cost-basis-methods -->

# Cost Basis Methods

When you sell an investment, the profit or loss you realize depends on which
shares you consider "sold." If you bought shares at different prices over time,
the **cost basis method** determines which purchase price is used to calculate
your gain or loss.

Wealthfolio supports three methods: **FIFO**, **LIFO**, and **WAC**. You can set
a method per account in the account settings.

---

## The Three Methods

### FIFO — First In, First Out

The shares you bought **earliest** are considered sold first.

- Most conservative approach for rising markets: the oldest (usually cheaper)
  shares are sold first, which tends to produce **higher taxable gains**.
- Default method in the **United States** (IRS guidance) and many other
  jurisdictions.

### LIFO — Last In, First Out

The shares you bought **most recently** are considered sold first.

- In rising markets, the newest (usually more expensive) shares are sold first,
  which tends to produce **lower taxable gains**.
- Used in some tax regimes such as **Italy's regime dichiarativo**
  (self-reported taxation) for certain asset classes.
- Note: LIFO is not permitted under IFRS and is less common internationally.

### WAC — Weighted Average Cost

The cost basis is the **average price** of all shares held, weighted by
quantity.

Every time you buy more shares, the average is recalculated across the entire
position.

- Produces a consistent, predictable cost basis regardless of purchase order.
- Required or preferred in several jurisdictions:
  - **Italy** (regime del risparmio amministrato): WAC is the mandatory method
    for broker-administered accounts.
  - **United Kingdom**: the HMRC Section 104 pool rule pools all shares of the
    same security at a weighted average cost, which is functionally equivalent
    to WAC.
  - **Canada**: Adjusted Cost Base (ACB) is also a weighted average.

---

## Worked Example

Suppose you hold shares of a stock with the following purchase history:

| Date       | Action | Quantity | Price  | Total Cost |
| ---------- | ------ | -------- | ------ | ---------- |
| 2024-01-10 | Buy    | 10       | $10.00 | $100.00    |
| 2024-06-15 | Buy    | 10       | $20.00 | $200.00    |

You now sell **5 shares**.

| Method | Shares used      | Cost basis per share | Total cost basis | Gain (if sold at $25) |
| ------ | ---------------- | -------------------- | ---------------- | --------------------- |
| FIFO   | 5 from Jan batch | $10.00               | $50.00           | $75.00                |
| LIFO   | 5 from Jun batch | $20.00               | $100.00          | $25.00                |
| WAC    | 5 at avg price   | $15.00               | $75.00           | $50.00                |

**WAC average price** = (10 × $10 + 10 × $20) / 20 = $15.00

As the example shows, the same sale produces very different taxable gains
depending on the method chosen.

---

## Which Method Should I Use?

Choose the method that matches the **tax regime of the account**, or the one
your broker applies:

| Country / Regime                  | Recommended Method |
| --------------------------------- | ------------------ |
| United States (default)           | FIFO               |
| Italy — risparmio amministrato    | WAC                |
| Italy — regime dichiarativo       | LIFO               |
| United Kingdom (Section 104 pool) | WAC                |
| Canada (Adjusted Cost Base)       | WAC                |
| Other / personal preference       | FIFO or WAC        |

> **Important:** This table is a general guide. Always verify the rules that
> apply to your specific situation with a qualified tax advisor, as local
> regulations can vary.

---

## What Happens When You Change the Method

If you change the cost basis method on an existing account, Wealthfolio will
**recalculate all holdings and gains** for that account from scratch using the
new method. Historical transactions are not modified — only the way gains are
computed changes.

This means:

- Unrealized and realized gain figures will update immediately.
- Portfolio performance numbers may change.
- The change is applied retroactively to all transactions in the account.
