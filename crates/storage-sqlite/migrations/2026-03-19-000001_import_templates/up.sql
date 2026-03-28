-- Generic mapping profile store: CSV import templates + broker sync profiles.
-- kind discriminates the config shape; source_system scopes broker profiles.

CREATE TABLE IF NOT EXISTS import_templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL DEFAULT 'USER',
    kind TEXT NOT NULL DEFAULT 'CSV_ACTIVITY',
    source_system TEXT NOT NULL DEFAULT '',
    config_version INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed system templates (all CSV_ACTIVITY, source_system='')
-- Charles Schwab brokerage transaction export
INSERT OR REPLACE INTO import_templates (id, name, scope, kind, source_system, config_version, config, created_at, updated_at)
VALUES (
    'system_schwab',
    'Charles Schwab',
    'SYSTEM',
    'CSV_ACTIVITY',
    '',
    1,
    '{"fieldMappings":{"date":"Date","activityType":"Action","symbol":"Symbol","quantity":"Quantity","unitPrice":"Price","fee":"Fees & Comm","amount":"Amount","comment":"Description"},"activityMappings":{"BUY":["Buy","Buy to Open","Buy to Close","Reinvest Shares"],"SELL":["Sell","Sell to Open","Sell to Close","Expired"],"SPLIT":["Stock Split","Reverse Split"],"DIVIDEND":["Cash Dividend","Qualified Dividend","Non-Qualified Div","Special Dividend","Reinvest Dividend","Qual Div Reinvest","Long Term Cap Gain","Long Term Cap Gain Reinvest","Short Term Cap Gain","Short Term Cap Gain Reinvest","Pr Yr Cash Div","Pr Yr Div Reinvest","Pr Yr Special Div","Cash In Lieu"],"INTEREST":["Bank Interest","Bond Interest","Credit Interest"],"TAX":["Foreign Tax Paid","NRA Withholding","NRA Tax Adj"],"FEE":["Service Fee","ADR Mgmt Fee","Margin Interest"],"CREDIT":["Misc Cash Entry","Promotional Award"],"DEPOSIT":["Funds Received","Wire Funds","Wire Funds Received","Wire Received","MoneyLink Transfer","MoneyLink Deposit"],"WITHDRAWAL":["Wire Sent","MoneyLink Withdrawal","Funds Disbursed"],"TRANSFER_IN":["Security Transfer","Journal","Journaled Shares","Stock Plan Activity","Stock Merger"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"MM/dd/yyyy","decimalSeparator":"auto","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":1,"skipBottomRows":1}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- TD Direct Investing (WebBroker) transaction export
INSERT OR REPLACE INTO import_templates (id, name, scope, kind, source_system, config_version, config, created_at, updated_at)
VALUES (
    'system_td_webbroker',
    'TD WebBroker',
    'SYSTEM',
    'CSV_ACTIVITY',
    '',
    1,
    '{"fieldMappings":{"date":"Trade Date","activityType":"Action","quantity":"Quantity","unitPrice":"Price","fee":"Commission","amount":"Net Amount","comment":"Description"},"activityMappings":{"BUY":["BUY","DRIP"],"SELL":["SELL"],"DIVIDEND":["DIV","TXPDDV"],"TAX":["WHTX02"],"DEPOSIT":["CONT"],"TRANSFER_IN":["TFR-IN"],"WITHDRAWAL":["TFROUT"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"dd MMM yyyy","decimalSeparator":"auto","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":3,"skipBottomRows":0}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Trading 212 brokerage transaction export
INSERT OR REPLACE INTO import_templates (id, name, scope, kind, source_system, config_version, config, created_at, updated_at)
VALUES (
    'system_trading212',
    'Trading 212',
    'SYSTEM',
    'CSV_ACTIVITY',
    '',
    1,
    '{"fieldMappings":{"date":"Time","activityType":"Action","symbol":"Ticker","isin":"ISIN","quantity":"No. of shares","unitPrice":"Price / share","fee":"Currency conversion fee","amount":"Total","currency":"Currency (Total)","comment":"Notes"},"activityMappings":{"BUY":["Market buy","Limit buy","Stop buy","Stock distribution","Stock split open"],"SELL":["Market sell","Limit sell","Stop sell","Stock split close","Transfer out"],"DIVIDEND":["Dividend (Ordinary)","Dividend (Dividend)","Dividend (Dividend manufactured payment)","Dividend (Tax exempted)","Dividend (Return of capital)"],"INTEREST":["Interest on cash","Lending interest"],"FEE":["ADR Fee","Card debit","New card cost"],"DEPOSIT":["Deposit"],"WITHDRAWAL":["Withdrawal","Spending"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"YYYY-MM-DD HH:mm:ss","decimalSeparator":"auto","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":0,"skipBottomRows":0}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Wealthsimple "Custom Statement" CSV export
INSERT OR REPLACE INTO import_templates (id, name, scope, kind, source_system, config_version, config, created_at, updated_at)
VALUES (
    'system_wealthsimple',
    'Wealthsimple',
    'SYSTEM',
    'CSV_ACTIVITY',
    '',
    1,
    '{"fieldMappings":{"date":"transaction_date","activityType":["activity_sub_type","activity_type"],"subtype":"activity_type","symbol":"symbol","quantity":"quantity","unitPrice":"unit_price","fee":"commission","amount":"net_cash_amount","currency":"currency","account":"account_id","comment":"name","instrumentType":"account_type"},"activityMappings":{"BUY":["BUY","DRIP","Trade","OptionExercise"],"SELL":["SELL"],"DIVIDEND":["Dividend","ReturnOfCapital","NonCashDistribution"],"INTEREST":["Interest"],"DEPOSIT":["EFT","E_TRFIN","TRANSFER","TRANSFER_TF","MoneyMovement","WDA_IN","CONTRIBUTION"],"WITHDRAWAL":["E_TRFOUT","OBP_OUT","WDA_OUT","SPEND"],"TRANSFER_IN":["FxExchange"],"SPLIT":["CorporateAction","SUBDIVISION"],"TAX":["NonResidentTax"],"FEE":["Fee"],"CREDIT":["Refund","AdministrativePayment","MANAGEMENT_FEE_REFUND","GIVEAWAY","CASHBACK","BonusPayment"],"TRANSFER_OUT":["InternalSecurityTransfer"],"ADJUSTMENT":["Correction","WRITE_OFF","ANOMALY"]},"symbolMappings":{},"accountMappings":{},"symbolMappingMeta":{},"parseConfig":{"delimiter":",","dateFormat":"ISO8601","decimalSeparator":".","thousandsSeparator":"auto","hasHeaderRow":true,"skipTopRows":0,"skipBottomRows":1}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Migrate existing profiles to templates (kind=CSV_ACTIVITY, source_system='')
INSERT INTO import_templates (id, name, scope, kind, source_system, config_version, config, created_at, updated_at)
SELECT
    account_id,
    CASE
        WHEN trim(name) = '' THEN 'Imported Template'
        ELSE name
    END,
    'USER',
    'CSV_ACTIVITY',
    '',
    1,
    config,
    created_at,
    updated_at
FROM activity_import_profiles legacy
WHERE NOT EXISTS (
    SELECT 1
    FROM import_templates templates
    WHERE templates.id = legacy.account_id
);

-- Account → template association table
-- context_kind + source_system discriminate CSV vs broker links.
-- source_system = '' for CSV rows.
CREATE TABLE import_account_templates (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    context_kind TEXT NOT NULL DEFAULT 'CSV_ACTIVITY',
    source_system TEXT NOT NULL DEFAULT '',
    template_id TEXT NOT NULL REFERENCES import_templates(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, context_kind, source_system)
);

-- Link each account to its migrated template (all existing profiles are CSV_ACTIVITY).
INSERT INTO import_account_templates (id, account_id, context_kind, source_system, template_id, created_at, updated_at)
SELECT account_id, account_id, 'CSV_ACTIVITY', '', account_id, created_at, updated_at
FROM activity_import_profiles;

DROP TABLE activity_import_profiles;

-- Update sync_table_state
DELETE FROM sync_table_state WHERE table_name = 'activity_import_profiles';
INSERT OR IGNORE INTO sync_table_state (table_name, enabled) VALUES
    ('import_templates', 1),
    ('import_account_templates', 1);

CREATE INDEX IF NOT EXISTS ix_activities_source_identity
ON activities(source_system, account_id, source_record_id)
WHERE source_system IS NOT NULL AND source_record_id IS NOT NULL;
