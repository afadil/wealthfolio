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
CREATE TABLE import_account_templates (
    account_id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT NOT NULL REFERENCES import_templates(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Link each account to its migrated template
INSERT INTO import_account_templates (account_id, template_id, created_at, updated_at)
SELECT account_id, account_id, created_at, updated_at
FROM activity_import_profiles;

DROP TABLE activity_import_profiles;
