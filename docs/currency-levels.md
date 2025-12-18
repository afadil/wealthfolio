# Understanding Currencies in Wealthfolio

Wealthfolio supports multi-currency portfolios, allowing you to track investments across different currencies. This guide explains the four currency levels in the application.

## The Four Currency Levels

### 1. Base Currency (Portfolio Level)

Your **base currency** is the primary currency used to view your entire portfolio's performance and total value. This is typically your home country's currency.

- Set once for your portfolio
- All portfolio-wide metrics (total value, gains/losses, performance) are displayed in this currency
- Example: If you live in Canada, your base currency might be CAD

### 2. Account Currency (Per Account)

Each investment account has its own **account currency**. This represents the currency the account operates in.

- Set when you create an account
- Cash balances are tracked in the account currency
- Net contributions and withdrawals are recorded in account currency
- Example: A US brokerage account would have USD as its account currency

### 3. Asset/Position Currency (Per Holding)

Each asset you hold has a **position currency** based on where it's listed and traded.

- Determined by the asset's primary exchange
- Cost basis and book value are tracked in this currency
- Example: Apple (AAPL) trades in USD, BMW trades in EUR

### 4. Activity Currency (Per Transaction)

When you enter a transaction, you specify the **activity currency** - the currency you actually used for that transaction.

- Can differ from the account or position currency
- You can enter a transaction in any currency
- Example: Buying a US stock through a CAD account, entering the price in CAD

## The FX Rate Field

When your activity currency differs from your account currency, you can provide an **FX Rate** to specify the exact exchange rate used for that transaction.

### When to Use FX Rate

- **Importing transactions**: When importing from a broker statement that shows the exact rate used
- **Manual entry**: When you know the specific rate your broker applied
- **Different currencies**: When entering a transaction in a currency different from your account

### How FX Rate Works

The FX rate converts your activity currency to the appropriate target currency:

| Scenario | FX Rate Converts |
|----------|------------------|
| Activity in USD, Account in CAD | USD → CAD |
| Activity in CAD, Account in CAD, Asset in USD | CAD → USD |

If you don't provide an FX rate, Wealthfolio will automatically look up the exchange rate for that date.

## Examples

### Example 1: Simple Same-Currency Transaction

- Base Currency: CAD
- Account Currency: CAD
- Buying: TD Bank (TD.TO) - trades in CAD
- Activity Currency: CAD

No currency conversion needed. Everything is in CAD.

### Example 2: US Stock in Canadian Account

- Base Currency: CAD
- Account Currency: CAD
- Buying: Apple (AAPL) - trades in USD
- Activity Currency: USD
- FX Rate: 1.35 (1 USD = 1.35 CAD)

The stock's cost basis is tracked in USD. Cash is deducted from your account in CAD using the FX rate.

### Example 3: Entering Price in Account Currency

- Base Currency: CAD
- Account Currency: CAD
- Buying: Apple (AAPL) - trades in USD
- Activity Currency: CAD (you enter the price in CAD)
- FX Rate: 0.74 (1 CAD = 0.74 USD)

You entered the price in CAD, but the cost basis is converted to USD (the asset's currency) using the FX rate.

## Tips

1. **Consistency**: Try to enter transactions in the same currency your broker reports them
2. **FX Rate accuracy**: If your broker provides the exact exchange rate, use it for accurate tracking
3. **Automatic rates**: If you leave FX rate empty, Wealthfolio uses market rates for that date
4. **Viewing holdings**: Holdings are displayed in their native currency, with converted values shown in your base currency
