CREATE TABLE IF NOT EXISTS import_templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL DEFAULT 'USER',
    config TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed system templates
-- Charles Schwab brokerage transaction export
-- Columns: Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount
-- Row 1: account title line  →  skipTopRows: 1
-- Row 2: column headers      →  hasHeaderRow: true
-- Last row: "Transactions Total" footer  →  skipBottomRows: 1
INSERT OR IGNORE INTO import_templates (id, name, scope, config, created_at, updated_at)
VALUES (
    'system_schwab',
    'Charles Schwab',
    'SYSTEM',
    '{"fieldMappings":{"date":"Date","activityType":"Action","symbol":"Symbol","quantity":"Quantity","unitPrice":"Price","fee":"Fees & Comm","amount":"Amount","comment":"Description"},"activityMappings":{"BUY":["Buy","Buy to Open","Buy to Close","Reinvest Shares"],"SELL":["Sell","Sell to Open","Sell to Close","Expired"],"SPLIT":["Stock Split","Reverse Split"],"DIVIDEND":["Cash Dividend","Qualified Dividend","Non-Qualified Div","Special Dividend","Reinvest Dividend","Qual Div Reinvest","Long Term Cap Gain","Long Term Cap Gain Reinvest","Short Term Cap Gain","Short Term Cap Gain Reinvest","Pr Yr Cash Div","Pr Yr Div Reinvest","Pr Yr Special Div","Cash In Lieu"],"INTEREST":["Bank Interest","Bond Interest","Credit Interest"],"TAX":["Foreign Tax Paid","NRA Withholding","NRA Tax Adj"],"FEE":["Service Fee","ADR Mgmt Fee","Margin Interest"],"CREDIT":["Misc Cash Entry","Promotional Award"],"DEPOSIT":["Funds Received","Wire Funds","Wire Funds Received","Wire Received","MoneyLink Transfer","MoneyLink Deposit"],"WITHDRAWAL":["Wire Sent","MoneyLink Withdrawal","Funds Disbursed"],"TRANSFER_IN":["Security Transfer","Journal","Journaled Shares","Stock Plan Activity","Stock Merger"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"MM/dd/yyyy","decimalSeparator":"auto","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":1,"skipBottomRows":1}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- TD Direct Investing (WebBroker) transaction export
-- Columns: Trade Date, Settle Date, Description, Action, Quantity, Price, Commission, Net Amount, Security Type, Currency
-- Rows 1-3: metadata (as-of timestamp, account info, blank) → skipTopRows: 3
-- Row 4: column headers → hasHeaderRow: true
-- No footer row → skipBottomRows: 0
-- Date format: dd MMM yyyy (e.g. "15 Jul 2025")
-- No dedicated symbol column — ticker must be resolved manually in mapping step
INSERT OR IGNORE INTO import_templates (id, name, scope, config, created_at, updated_at)
VALUES (
    'system_td_webbroker',
    'TD WebBroker',
    'SYSTEM',
    '{"fieldMappings":{"date":"Trade Date","activityType":"Action","quantity":"Quantity","unitPrice":"Price","fee":"Commission","amount":"Net Amount","comment":"Description"},"activityMappings":{"BUY":["BUY","DRIP"],"SELL":["SELL"],"DIVIDEND":["DIV","TXPDDV"],"TAX":["WHTX02"],"DEPOSIT":["CONT"],"TRANSFER_IN":["TFR-IN"],"WITHDRAWAL":["TFROUT"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"dd MMM yyyy","decimalSeparator":"auto","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":3,"skipBottomRows":0}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Trading 212 brokerage transaction export
-- Columns: Action, Time, ISIN, Ticker, Name, No. of shares, Price / share, Currency (Price / share),
--          Exchange rate, Result, Currency (Result), Total, Currency (Total),
--          Withholding tax, Currency (Withholding tax), Notes, ID,
--          Currency conversion fee, Currency (Currency conversion fee)
-- No header metadata rows → skipTopRows: 0
-- Row 1: column headers → hasHeaderRow: true
-- Date format: yyyy-MM-dd HH:mm:ss (e.g. "2024-01-15 09:30:03")
-- Note: "Currency conversion" rows (FX conversions) have no Ticker and cannot be mapped
--       to a single activity; they will surface as unresolved rows in the review step.
INSERT OR IGNORE INTO import_templates (id, name, scope, config, created_at, updated_at)
VALUES (
    'system_trading212',
    'Trading 212',
    'SYSTEM',
    '{"fieldMappings":{"date":"Time","activityType":"Action","symbol":"Ticker","isin":"ISIN","quantity":"No. of shares","unitPrice":"Price / share","fee":"Currency conversion fee","amount":"Total","currency":"Currency (Total)","comment":"Notes"},"activityMappings":{"BUY":["Market buy","Limit buy","Stop buy","Stock distribution","Stock split open"],"SELL":["Market sell","Limit sell","Stop sell","Stock split close","Transfer out"],"DIVIDEND":["Dividend (Ordinary)","Dividend (Dividend)","Dividend (Dividend manufactured payment)","Dividend (Tax exempted)","Dividend (Return of capital)"],"INTEREST":["Interest on cash","Lending interest"],"FEE":["ADR Fee","Card debit","New card cost"],"DEPOSIT":["Deposit"],"WITHDRAWAL":["Withdrawal","Spending"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"YYYY-MM-DD HH:mm:ss","decimalSeparator":"auto","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":0,"skipBottomRows":0}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Interactive Brokers Flex Query — Trades export
-- The standard Activity Statement CSV is a multi-section file (every row is prefixed with
-- section name + row type) and cannot be parsed as a flat table. Use a Flex Query instead.
--
-- Setup: Client Portal → Reports → Flex Queries → Create / Edit Flex Query
--   · Sections to include: Trades
--   · Fields (add in this order):
--       Symbol, TradeDate, Buy/Sell, Quantity, TradePrice, IBCommission, Currency, Description
--   · Date Format: yyyy-MM-dd  (avoids the embedded comma in the default datetime format)
--   · Output Format: CSV
--   · Download and import the resulting file.
--
-- Quirks:
--   · IBCommission is always negative (a deduction); stored as-is — same as Schwab "Fees & Comm".
--   · Quantity should be unsigned in the Flex Query output; if you get negative quantities for
--     sells, edit the Flex Query and check "Unsigned Quantity" (or similar) in IB's field settings.
--   · Only BUY/SELL trades are covered. Dividends, interest, and deposits require a separate
--     Flex Query and cannot be combined with trades in a single flat-table import.
--   · Option symbols include expiry + strike (e.g. "SPY 18MAR22 440.0 P") and will not resolve
--     to a market-data quote automatically — map them manually in the symbol review step.
INSERT OR IGNORE INTO import_templates (id, name, scope, config, created_at, updated_at)
VALUES (
    'system_ibkr',
    'Interactive Brokers',
    'SYSTEM',
    '{"fieldMappings":{"date":"TradeDate","activityType":"Buy/Sell","symbol":"Symbol","quantity":"Quantity","unitPrice":"TradePrice","fee":"IBCommission","currency":"Currency","comment":"Description"},"activityMappings":{"BUY":["BUY","Buy"],"SELL":["SELL","Sell"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"ISO8601","decimalSeparator":".","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":0,"skipBottomRows":0}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Wealthsimple "Custom Statement" CSV export
-- Columns (14-col format): transaction_date, settlement_date, account_id,
--          account_type, activity_type, activity_sub_type, direction,
--          symbol, name, currency, quantity, unit_price, commission,
--          net_cash_amount
-- Some exports include a 15th column (ticker) between symbol and name;
-- since mapping is by header name this works either way.
-- Row 1: column headers  →  hasHeaderRow: true
-- Last row: quoted timestamp footer ("As of …")  →  skipBottomRows: 1
-- Date format: YYYY-MM-DD (ISO 8601)
--
-- Quirks:
--   · "Trade" covers both buys and sells — the sub_type column (BUY/SELL)
--     distinguishes them but cannot be used as the primary mapping column.
--     All Trade rows map to BUY; SELL trades must be re-typed in review.
--   · "MoneyMovement" covers deposits and withdrawals. Since numeric signs
--     are stripped during import, withdrawals also appear as DEPOSIT and
--     must be re-typed in review.
--   · "FxExchange" and "LegacyCorporateAction" rows have no canonical
--     equivalent and will surface as unresolved — users can skip them.
--   · commission is typically 0 (zero-commission trading).
INSERT OR IGNORE INTO import_templates (id, name, scope, config, created_at, updated_at)
VALUES (
    'system_wealthsimple',
    'Wealthsimple',
    'SYSTEM',
    '{"fieldMappings":{"date":"transaction_date","activityType":"activity_type","symbol":"symbol","quantity":"quantity","unitPrice":"unit_price","fee":"commission","amount":"net_cash_amount","currency":"currency","account":"account_id","comment":"name"},"activityMappings":{"BUY":["Trade"],"DIVIDEND":["Dividend"],"INTEREST":["Interest"],"DEPOSIT":["MoneyMovement"],"SPLIT":["CorporateAction"],"TAX":["NonResidentTax"],"FEE":["Fee"],"CREDIT":["Refund","AdministrativePayment"],"TRANSFER_OUT":["InternalSecurityTransfer"],"ADJUSTMENT":["Correction"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"ISO8601","decimalSeparator":".","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":0,"skipBottomRows":1}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Migrate existing profiles to templates (use account_id as template id)
INSERT INTO import_templates (id, name, scope, config, created_at, updated_at)
SELECT
    account_id,
    CASE
        WHEN trim(name) = '' THEN 'Imported Template'
        ELSE name
    END,
    'USER',
    config,
    created_at,
    updated_at
FROM activity_import_profiles legacy
WHERE NOT EXISTS (
    SELECT 1
    FROM import_templates templates
    WHERE templates.id = legacy.account_id
);

-- Create account → template association table
-- id is the sync PK; (account_id, import_type) is a UNIQUE constraint that enforces
-- one template per (account, import_type) pair without exposing a composite PK to sync.
-- import_type values: 'ACTIVITY' | 'HOLDINGS'
CREATE TABLE import_account_templates (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    import_type TEXT NOT NULL DEFAULT 'ACTIVITY',
    template_id TEXT NOT NULL REFERENCES import_templates(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, import_type)
);

-- Link each account to its migrated template (all existing profiles are ACTIVITY imports).
-- Reuse account_id as the id for migrated rows (UUIDs already).
INSERT INTO import_account_templates (id, account_id, import_type, template_id, created_at, updated_at)
SELECT account_id, account_id, 'ACTIVITY', account_id, created_at, updated_at
FROM activity_import_profiles;

DROP TABLE activity_import_profiles;

-- Update sync_table_state: remove stale entry for the dropped table,
-- seed entries for the two replacement tables.
DELETE FROM sync_table_state WHERE table_name = 'activity_import_profiles';
INSERT OR IGNORE INTO sync_table_state (table_name, enabled) VALUES
    ('import_templates', 1),
    ('import_account_templates', 1);
