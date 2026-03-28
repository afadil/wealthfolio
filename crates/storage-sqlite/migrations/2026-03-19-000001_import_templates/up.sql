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
INSERT OR REPLACE INTO import_templates (id, name, scope, config, created_at, updated_at)
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
INSERT OR REPLACE INTO import_templates (id, name, scope, config, created_at, updated_at)
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
INSERT OR REPLACE INTO import_templates (id, name, scope, config, created_at, updated_at)
VALUES (
    'system_trading212',
    'Trading 212',
    'SYSTEM',
    '{"fieldMappings":{"date":"Time","activityType":"Action","symbol":"Ticker","isin":"ISIN","quantity":"No. of shares","unitPrice":"Price / share","fee":"Currency conversion fee","amount":"Total","currency":"Currency (Total)","comment":"Notes"},"activityMappings":{"BUY":["Market buy","Limit buy","Stop buy","Stock distribution","Stock split open"],"SELL":["Market sell","Limit sell","Stop sell","Stock split close","Transfer out"],"DIVIDEND":["Dividend (Ordinary)","Dividend (Dividend)","Dividend (Dividend manufactured payment)","Dividend (Tax exempted)","Dividend (Return of capital)"],"INTEREST":["Interest on cash","Lending interest"],"FEE":["ADR Fee","Card debit","New card cost"],"DEPOSIT":["Deposit"],"WITHDRAWAL":["Withdrawal","Spending"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"YYYY-MM-DD HH:mm:ss","decimalSeparator":"auto","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":0,"skipBottomRows":0}}',
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
-- Uses fallback-column mapping for activityType:
--   activityType → ["activity_sub_type", "activity_type"]
--   Reads sub_type first (BUY/SELL/EFT/…), falls back to activity_type
--   (Dividend/Interest/Fee/…) when sub_type is empty.
--
-- Sign-based direction inference auto-flips DEPOSIT↔WITHDRAWAL
-- based on the raw amount sign (negative → WITHDRAWAL).
--
-- Quirks:
--   · "FxExchange" and "LegacyCorporateAction" rows have no canonical
--     equivalent and will surface as unresolved — users can skip them.
--   · commission is typically 0 (zero-commission trading).
INSERT OR REPLACE INTO import_templates (id, name, scope, config, created_at, updated_at)
VALUES (
    'system_wealthsimple',
    'Wealthsimple',
    'SYSTEM',
    '{"fieldMappings":{"date":"transaction_date","activityType":["activity_sub_type","activity_type"],"subtype":"activity_type","symbol":"symbol","quantity":"quantity","unitPrice":"unit_price","fee":"commission","amount":"net_cash_amount","currency":"currency","account":"account_id","comment":"name","instrumentType":"account_type"},"activityMappings":{"BUY":["BUY","DRIP","Trade","OptionExercise"],"SELL":["SELL"],"DIVIDEND":["Dividend","ReturnOfCapital","NonCashDistribution"],"INTEREST":["Interest"],"DEPOSIT":["EFT","E_TRFIN","TRANSFER","TRANSFER_TF","MoneyMovement","WDA_IN","CONTRIBUTION"],"WITHDRAWAL":["E_TRFOUT","OBP_OUT","WDA_OUT","SPEND"],"TRANSFER_IN":["FxExchange"],"SPLIT":["CorporateAction","SUBDIVISION"],"TAX":["NonResidentTax"],"FEE":["Fee"],"CREDIT":["Refund","AdministrativePayment","MANAGEMENT_FEE_REFUND","GIVEAWAY","CASHBACK","BonusPayment"],"TRANSFER_OUT":["InternalSecurityTransfer"],"ADJUSTMENT":["Correction","WRITE_OFF","ANOMALY"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"ISO8601","decimalSeparator":".","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":0,"skipBottomRows":1}}',
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


CREATE INDEX IF NOT EXISTS ix_activities_source_identity
ON activities(source_system, account_id, source_record_id)
WHERE source_system IS NOT NULL AND source_record_id IS NOT NULL;
