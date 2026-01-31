-- Taxonomies Migration
-- Creates tables for user-configurable asset classification taxonomies
-- Supports hierarchical categories with colors for visualization
-- Auto-migrates from metadata.legacy (set by core_schema_redesign migration)

-- ============================================================================
-- TAXONOMIES TABLE
-- ============================================================================

CREATE TABLE taxonomies (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#8abceb',
    description TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    is_single_select INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ix_taxonomies_sort_order ON taxonomies(sort_order);

-- ============================================================================
-- TAXONOMY_CATEGORIES TABLE
-- ============================================================================

CREATE TABLE taxonomy_categories (
    id TEXT NOT NULL,
    taxonomy_id TEXT NOT NULL,
    parent_id TEXT,
    name TEXT NOT NULL,
    key TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#808080',
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    PRIMARY KEY (taxonomy_id, id),
    FOREIGN KEY (taxonomy_id) REFERENCES taxonomies(id) ON DELETE CASCADE,
    FOREIGN KEY (taxonomy_id, parent_id) REFERENCES taxonomy_categories(taxonomy_id, id) ON DELETE CASCADE
);

CREATE INDEX ix_taxonomy_categories_parent ON taxonomy_categories(taxonomy_id, parent_id);
CREATE INDEX ix_taxonomy_categories_key ON taxonomy_categories(taxonomy_id, key);

-- ============================================================================
-- ASSET_TAXONOMY_ASSIGNMENTS TABLE
-- ============================================================================

CREATE TABLE asset_taxonomy_assignments (
    id TEXT NOT NULL PRIMARY KEY,
    asset_id TEXT NOT NULL,
    taxonomy_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 10000,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (taxonomy_id, category_id) REFERENCES taxonomy_categories(taxonomy_id, id) ON DELETE CASCADE,

    CHECK (weight >= 0 AND weight <= 10000)
);

CREATE INDEX ix_asset_taxonomy_assignments_asset ON asset_taxonomy_assignments(asset_id);
CREATE INDEX ix_asset_taxonomy_assignments_category ON asset_taxonomy_assignments(taxonomy_id, category_id);
CREATE UNIQUE INDEX ix_asset_taxonomy_assignment_unique ON asset_taxonomy_assignments(asset_id, taxonomy_id, category_id);

-- ============================================================================
-- SEED DATA: DEFAULT TAXONOMIES
-- ============================================================================

INSERT INTO taxonomies (id, name, color, description, is_system, is_single_select, sort_order)
VALUES
  ('instrument_type', 'Instrument Type', '#4385be',
   'Instrument structure used for filtering/reporting (e.g., Stock, ETF, Bond, Option). Should not drive calculation logic.',
   1, 1, 10),
  ('asset_classes', 'Asset Classes', '#879a39',
   'High-level asset class rollup (e.g., Equity, Debt, Cash, Real Estate, Commodity) for summaries and charts.',
   1, 0, 20),
  ('industries_gics', 'Industries (GICS)', '#da702c',
   'Global Industry Classification Standard (GICS) hierarchy: Sector -> Industry Group -> Industry -> Sub-Industry.',
   1, 0, 30),
  ('regions', 'Regions', '#8b7ec8',
   'Geographic exposure grouping for reporting (e.g., North America, Europe, Emerging Markets).',
   1, 0, 40),
  ('risk_category', 'Risk Category', '#d14d41',
   'Risk level classification for assets. Single-select: each asset can only have one risk category assigned.',
   1, 1, 50),
  ('custom_groups', 'Custom Groups', '#878580',
   'User-defined tags for grouping assets. Use for watchlists, themes, strategies, or any personal organization.',
   1, 0, 100);

-- ============================================================================
-- SEED DATA: INSTRUMENT TYPE CATEGORIES
-- Comprehensive hierarchical instrument classification
-- Total: 11 top-level + 38 children = 49 categories
-- ============================================================================

-- Top-level Instrument Types (12) - Flexoki theme colors

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('EQUITY_SECURITY', 'instrument_type', NULL, 'Stocks',                  'EQUITY_SECURITY', '#4385be', 1),
  ('DEBT_SECURITY',   'instrument_type', NULL, 'Bonds',                   'DEBT_SECURITY',   '#d14d41', 2),
  ('FUND',            'instrument_type', NULL, 'Funds',                   'FUND',            '#3aa99f', 3),
  ('ETP',             'instrument_type', NULL, 'ETFs',                    'ETP',             '#8b7ec8', 4),
  ('DERIVATIVE',      'instrument_type', NULL, 'Options & Futures',       'DERIVATIVE',      '#da702c', 5),
  ('CASH_FX',         'instrument_type', NULL, 'Cash & FX',               'CASH_FX',         '#879a39', 6),
  ('STRUCTURED',      'instrument_type', NULL, 'Structured Notes',        'STRUCTURED',      '#d0a215', 7),
  ('REAL_ASSET',      'instrument_type', NULL, 'Physical Assets',         'REAL_ASSET',      '#bc5215', 8),
  ('DIGITAL_ASSET',   'instrument_type', NULL, 'Crypto',                  'DIGITAL_ASSET',   '#ce5d97', 9),
  ('PRIVATE_VEHICLE', 'instrument_type', NULL, 'Private Investments',     'PRIVATE_VEHICLE', '#5e409d', 10),
  ('OTHER',           'instrument_type', NULL, 'Other',                   'OTHER',           '#878580', 11);

-- ============================================================================
-- EQUITY_SECURITY children (5) - Blue variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('STOCK_COMMON',        'instrument_type', 'EQUITY_SECURITY', 'Stock',              'STOCK_COMMON',        '#66a0c8', 1),
  ('STOCK_PREFERRED',     'instrument_type', 'EQUITY_SECURITY', 'Preferred Stock',    'STOCK_PREFERRED',     '#7cb0d2', 2),
  ('DEPOSITARY_RECEIPT',  'instrument_type', 'EQUITY_SECURITY', 'ADR / GDR',          'DEPOSITARY_RECEIPT',  '#92bfdb', 3),
  ('EQUITY_WARRANT_RIGHT','instrument_type', 'EQUITY_SECURITY', 'Warrant / Right',    'EQUITY_WARRANT_RIGHT','#a2c9e0', 4),
  ('PARTNERSHIP_UNIT',    'instrument_type', 'EQUITY_SECURITY', 'Partnership / Trust Unit', 'PARTNERSHIP_UNIT', '#b4d3e5', 5);

-- ============================================================================
-- DEBT_SECURITY children (5) - Red variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('BOND_GOVERNMENT',   'instrument_type', 'DEBT_SECURITY', 'Government Bond',            'BOND_GOVERNMENT',   '#dc6a5f', 1),
  ('BOND_CORPORATE',    'instrument_type', 'DEBT_SECURITY', 'Corporate Bond',             'BOND_CORPORATE',    '#e37d73', 2),
  ('BOND_MUNICIPAL',    'instrument_type', 'DEBT_SECURITY', 'Municipal Bond',             'BOND_MUNICIPAL',    '#e8908a', 3),
  ('BOND_CONVERTIBLE',  'instrument_type', 'DEBT_SECURITY', 'Convertible / Hybrid Bond',  'BOND_CONVERTIBLE',  '#eda39e', 4),
  ('MONEY_MARKET_DEBT', 'instrument_type', 'DEBT_SECURITY', 'T-Bills / CDs / Commercial Paper', 'MONEY_MARKET_DEBT', '#f2b6b2', 5);

-- ============================================================================
-- FUND children (4) - Cyan variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('FUND_MUTUAL',     'instrument_type', 'FUND', 'Mutual Fund',          'FUND_MUTUAL',     '#5abdac', 1),
  ('FUND_CLOSED_END', 'instrument_type', 'FUND', 'Closed-End Fund (CEF)', 'FUND_CLOSED_END', '#87d3c3', 2),
  ('FUND_PRIVATE',    'instrument_type', 'FUND', 'Private / Hedge Fund', 'FUND_PRIVATE',    '#a2dece', 3),
  ('FUND_FOF',        'instrument_type', 'FUND', 'Fund of Funds',        'FUND_FOF',        '#bfe8d9', 4);

-- ============================================================================
-- ETP children (3) - Purple variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('ETF', 'instrument_type', 'ETP', 'ETF',                   'ETF', '#a699d0', 1),
  ('ETN', 'instrument_type', 'ETP', 'ETN',                   'ETN', '#b8afda', 2),
  ('ETC', 'instrument_type', 'ETP', 'Commodity ETP (ETC/ETP)', 'ETC', '#c4b9e0', 3);

-- ============================================================================
-- DERIVATIVE children (4) - Orange variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('OPTION',         'instrument_type', 'DERIVATIVE', 'Option',              'OPTION',         '#ec8b49', 1),
  ('FUTURE',         'instrument_type', 'DERIVATIVE', 'Futures',             'FUTURE',         '#f09c60', 2),
  ('OTC_DERIVATIVE', 'instrument_type', 'DERIVATIVE', 'Forward / Swap (OTC)', 'OTC_DERIVATIVE', '#f9ae77', 3),
  ('CFD',            'instrument_type', 'DERIVATIVE', 'CFD',                 'CFD',            '#fbc093', 4);

-- ============================================================================
-- CASH_FX children (3) - Green variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('CASH',        'instrument_type', 'CASH_FX', 'Cash Balance',       'CASH',        '#a0af54', 1),
  ('DEPOSIT',     'instrument_type', 'CASH_FX', 'Bank Deposit / Sweep', 'DEPOSIT',   '#adb85e', 2),
  ('FX_POSITION', 'instrument_type', 'CASH_FX', 'Currency Position',  'FX_POSITION', '#bec97e', 3);

-- ============================================================================
-- STRUCTURED children (3) - Yellow variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('STRUCTURED_NOTE',     'instrument_type', 'STRUCTURED', 'Structured Note',     'STRUCTURED_NOTE',     '#dfb431', 1),
  ('MARKET_LINKED_NOTE',  'instrument_type', 'STRUCTURED', 'Market-Linked Note',  'MARKET_LINKED_NOTE',  '#eccb60', 2),
  ('CREDIT_LINKED_NOTE',  'instrument_type', 'STRUCTURED', 'Credit-Linked Note',  'CREDIT_LINKED_NOTE',  '#f0d678', 3);

-- ============================================================================
-- REAL_ASSET children (3) - Orange-600 variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('PHYSICAL_COMMODITY', 'instrument_type', 'REAL_ASSET', 'Physical Commodity',    'PHYSICAL_COMMODITY', '#cb6120', 1),
  ('PHYSICAL_METAL',     'instrument_type', 'REAL_ASSET', 'Physical Gold / Silver', 'PHYSICAL_METAL',    '#da702c', 2),
  ('DIRECT_REAL_ESTATE', 'instrument_type', 'REAL_ASSET', 'Direct Real Estate',    'DIRECT_REAL_ESTATE', '#ec8b49', 3);

-- ============================================================================
-- DIGITAL_ASSET children (3) - Magenta variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('CRYPTO_NATIVE',      'instrument_type', 'DIGITAL_ASSET', 'Cryptocurrency',    'CRYPTO_NATIVE',      '#e47da8', 1),
  ('STABLECOIN',         'instrument_type', 'DIGITAL_ASSET', 'Stablecoin',        'STABLECOIN',         '#e88db3', 2),
  ('TOKENIZED_SECURITY', 'instrument_type', 'DIGITAL_ASSET', 'Tokenized Asset',   'TOKENIZED_SECURITY', '#ec9dbe', 3);

-- ============================================================================
-- PRIVATE_VEHICLE children (3) - Purple-600 variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('PRIVATE_COMPANY', 'instrument_type', 'PRIVATE_VEHICLE', 'Private Company Shares', 'PRIVATE_COMPANY', '#735eb5', 1),
  ('PRIVATE_LOAN',    'instrument_type', 'PRIVATE_VEHICLE', 'Private Loan / Note',    'PRIVATE_LOAN',    '#8b7ec8', 2),
  ('SPV',             'instrument_type', 'PRIVATE_VEHICLE', 'SPV / Private Vehicle',  'SPV',             '#a699d0', 3);

-- ============================================================================
-- OTHER children (2) - Base/gray variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('OTHER_UNKNOWN',      'instrument_type', 'OTHER', 'Unknown Instrument',         'OTHER_UNKNOWN',      '#9f9d96', 1),
  ('SYNTHETIC_INTERNAL', 'instrument_type', 'OTHER', 'Synthetic / Internal Position', 'SYNTHETIC_INTERNAL', '#b7b5ac', 2);

-- ============================================================================
-- SEED DATA: RISK CATEGORY
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('UNKNOWN', 'risk_category', NULL, 'Unknown',  'UNKNOWN', '#878580', 1),
  ('LOW',     'risk_category', NULL, 'Low',      'LOW',     '#879a39', 2),
  ('MEDIUM',  'risk_category', NULL, 'Medium',   'MEDIUM',  '#d0a215', 3),
  ('HIGH',    'risk_category', NULL, 'High',     'HIGH',    '#d14d41', 4);

-- ============================================================================
-- SEED DATA: ASSET CLASSES CATEGORIES
-- Comprehensive hierarchical asset class taxonomy
-- Total: 97 categories (7 top-level + subcategories)
-- ============================================================================

-- Top-level Asset Classes (7) - Flexoki theme colors
-- Cash=Green, Stocks=Blue, Bonds=Red, Real Estate=Orange, Commodities=Yellow, Alternatives=Purple, Crypto=Magenta
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('CASH',           'asset_classes', NULL, 'Cash',           'CASH',           '#879a39', 1),
  ('EQUITY',         'asset_classes', NULL, 'Equity',         'EQUITY',         '#4385be', 2),
  ('FIXED_INCOME',   'asset_classes', NULL, 'Fixed Income',   'FIXED_INCOME',   '#d14d41', 3),
  ('REAL_ESTATE',    'asset_classes', NULL, 'Real Estate',    'REAL_ESTATE',    '#da702c', 4),
  ('COMMODITIES',    'asset_classes', NULL, 'Commodities',    'COMMODITIES',    '#d0a215', 5),
  ('ALTERNATIVES',   'asset_classes', NULL, 'Alternatives',   'ALTERNATIVES',   '#8b7ec8', 6),
  ('DIGITAL_ASSETS', 'asset_classes', NULL, 'Digital Assets', 'DIGITAL_ASSETS', '#ce5d97', 7);

-- ============================================================================
-- CASH & CASH EQUIVALENTS (5 children) - Green variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('CASH_BANK_DEPOSITS',    'asset_classes', 'CASH', 'Bank Deposits',        'CASH_BANK_DEPOSITS',    '#a0af54', 1),
  ('CASH_TREASURY_BILLS',   'asset_classes', 'CASH', 'Treasury Bills',       'CASH_TREASURY_BILLS',   '#adb85e', 2),
  ('CASH_MONEY_MARKET',     'asset_classes', 'CASH', 'Money Market',         'CASH_MONEY_MARKET',     '#bec97e', 3),
  ('CASH_ULTRA_SHORT',      'asset_classes', 'CASH', 'Ultra-Short Duration', 'CASH_ULTRA_SHORT',      '#cdd597', 4),
  ('CASH_STABLE_VALUE',     'asset_classes', 'CASH', 'Stable Value',         'CASH_STABLE_VALUE',     '#dde2b2', 5);


-- ============================================================================
-- EQUITY (2 children + 9 grandchildren = 11) - Blue variants
-- ============================================================================
-- Level 1: Public Equity, Private Equity
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('EQUITY_PUBLIC',  'asset_classes', 'EQUITY', 'Public Stocks',  'EQUITY_PUBLIC',  '#66a0c8', 1),
  ('EQUITY_PRIVATE', 'asset_classes', 'EQUITY', 'Private Equity', 'EQUITY_PRIVATE', '#7cb0d2', 2);


-- Level 3: Private Equity strategies (standard)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('EQUITY_PRIVATE_BUYOUT',      'asset_classes', 'EQUITY_PRIVATE', 'Buyout',           'EQUITY_PRIVATE_BUYOUT',      '#92bfdb', 1),
  ('EQUITY_PRIVATE_GROWTH',      'asset_classes', 'EQUITY_PRIVATE', 'Growth Equity',    'EQUITY_PRIVATE_GROWTH',      '#a2c9e0', 2),
  ('EQUITY_PRIVATE_VC',          'asset_classes', 'EQUITY_PRIVATE', 'Venture Capital',  'EQUITY_PRIVATE_VC',          '#b4d3e5', 3),
  ('EQUITY_PRIVATE_SECONDARIES', 'asset_classes', 'EQUITY_PRIVATE', 'Secondaries',      'EQUITY_PRIVATE_SECONDARIES', '#c6dde8', 4),
  ('EQUITY_PRIVATE_REAL_ASSETS', 'asset_classes', 'EQUITY_PRIVATE', 'Private Real Assets', 'EQUITY_PRIVATE_REAL_ASSETS', '#d8e7ed', 5);


-- ============================================================================
-- FIXED INCOME — Level 2 (SOTA exposure buckets)
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('FI_SOVEREIGN',        'asset_classes', 'FIXED_INCOME', 'Sovereign Bonds',        'FI_SOVEREIGN',        '#dc6a5f', 1),
  ('FI_CORPORATE',        'asset_classes', 'FIXED_INCOME', 'Corporate Bonds',        'FI_CORPORATE',        '#e37d73', 2),
  ('FI_MUNICIPAL',        'asset_classes', 'FIXED_INCOME', 'Municipal Bonds',        'FI_MUNICIPAL',        '#e8908a', 3),
  ('FI_AGENCY_SUPRA',     'asset_classes', 'FIXED_INCOME', 'Agency & Supranational', 'FI_AGENCY_SUPRA',     '#eda39e', 4),
  ('FI_EM_DEBT',          'asset_classes', 'FIXED_INCOME', 'Emerging Market Debt',   'FI_EM_DEBT',          '#f2b6b2', 5),
  ('FI_INFLATION_LINKED', 'asset_classes', 'FIXED_INCOME', 'Inflation-Linked Bonds', 'FI_INFLATION_LINKED', '#f7c9c6', 6),
  ('FI_SECURITIZED',      'asset_classes', 'FIXED_INCOME', 'Securitized Debt',       'FI_SECURITIZED',      '#f9d7d4', 7),
  ('FI_LOANS_FRN',        'asset_classes', 'FIXED_INCOME', 'Loans / Floating Rate',  'FI_LOANS_FRN',        '#fcdcda', 8),
  ('FI_CONVERTIBLE',      'asset_classes', 'FIXED_INCOME', 'Convertible Bonds',      'FI_CONVERTIBLE',      '#fde7e5', 9),
  ('FI_PREFERRED',        'asset_classes', 'FIXED_INCOME', 'Preferred Securities',   'FI_PREFERRED',        '#fef1ef', 10);

-- Level 3: Securitized Debt children (exposure types — OK to keep)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('FI_SECURITIZED_MBS',  'asset_classes', 'FI_SECURITIZED', 'Mortgage-Backed Securities', 'FI_SECURITIZED_MBS',  '#f7c9c6', 1),
  ('FI_SECURITIZED_ABS',  'asset_classes', 'FI_SECURITIZED', 'Asset-Backed Securities',    'FI_SECURITIZED_ABS',  '#fad6d4', 2),
  ('FI_SECURITIZED_CMBS', 'asset_classes', 'FI_SECURITIZED', 'Commercial MBS',              'FI_SECURITIZED_CMBS', '#fce3e2', 3);

-- ============================================================================
-- REAL ESTATE  - Orange variants
-- ============================================================================
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('RE_PUBLIC_REITS',  'asset_classes', 'REAL_ESTATE', 'Public REITs',        'RE_PUBLIC_REITS',  '#ec8b49', 1),
  ('RE_PRIVATE',       'asset_classes', 'REAL_ESTATE', 'Private Real Estate', 'RE_PRIVATE',       '#f09c60', 2);

-- ============================================================================
-- COMMODITIES (7 children + 19 grandchildren = 26) - Yellow variants
-- ============================================================================
-- Level 1: Precious Metals, Industrial Metals, Energy, Agriculture, Livestock, Index, Multi
-- COMMODITIES — Level 2 (exposure-only, clean)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('COMM_ENERGY',      'asset_classes', 'COMMODITIES', 'Energy',            'COMM_ENERGY',      '#eccb60', 1),
  ('COMM_PRECIOUS',    'asset_classes', 'COMMODITIES', 'Precious Metals',   'COMM_PRECIOUS',    '#dfb431', 2),
  ('COMM_INDUSTRIAL',  'asset_classes', 'COMMODITIES', 'Industrial Metals', 'COMM_INDUSTRIAL',  '#e4bd48', 3),
  ('COMM_AGRICULTURE', 'asset_classes', 'COMMODITIES', 'Agriculture',       'COMM_AGRICULTURE', '#f0d678', 4),
  ('COMM_LIVESTOCK',   'asset_classes', 'COMMODITIES', 'Livestock',         'COMM_LIVESTOCK',   '#f6e2a0', 5);

-- Level 2: Energy children (4)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('COMM_ENERGY_CRUDE_OIL',   'asset_classes', 'COMM_ENERGY', 'Crude Oil',        'COMM_ENERGY_CRUDE_OIL',   '#f0d678', 1),
  ('COMM_ENERGY_NATURAL_GAS', 'asset_classes', 'COMM_ENERGY', 'Natural Gas',      'COMM_ENERGY_NATURAL_GAS', '#f6e2a0', 2),
  ('COMM_ENERGY_REFINED',     'asset_classes', 'COMM_ENERGY', 'Refined Products', 'COMM_ENERGY_REFINED',     '#f9ecb8', 3),
  ('COMM_ENERGY_POWER',       'asset_classes', 'COMM_ENERGY', 'Power',            'COMM_ENERGY_POWER',       '#fcf5d0', 4);


-- Level 2: Precious Metals children (4)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('COMM_PRECIOUS_GOLD',      'asset_classes', 'COMM_PRECIOUS', 'Gold',      'COMM_PRECIOUS_GOLD',      '#f0d678', 1),
  ('COMM_PRECIOUS_SILVER',    'asset_classes', 'COMM_PRECIOUS', 'Silver',    'COMM_PRECIOUS_SILVER',    '#f6e2a0', 2),
  ('COMM_PRECIOUS_PLATINUM',  'asset_classes', 'COMM_PRECIOUS', 'Platinum',  'COMM_PRECIOUS_PLATINUM',  '#f9ecb8', 3),
  ('COMM_PRECIOUS_PALLADIUM', 'asset_classes', 'COMM_PRECIOUS', 'Palladium', 'COMM_PRECIOUS_PALLADIUM', '#fcf5d0', 4);


-- Industrial Metals — Level 3 (retail-clean)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('COMM_INDUSTRIAL_COPPER',   'asset_classes', 'COMM_INDUSTRIAL', 'Copper',                'COMM_INDUSTRIAL_COPPER',   '#eccb60', 1),
  ('COMM_INDUSTRIAL_ALUMINUM', 'asset_classes', 'COMM_INDUSTRIAL', 'Aluminum',              'COMM_INDUSTRIAL_ALUMINUM', '#f3dc8c', 2),
  ('COMM_INDUSTRIAL_NICKEL',   'asset_classes', 'COMM_INDUSTRIAL', 'Nickel',                'COMM_INDUSTRIAL_NICKEL',   '#f0d678', 3),
  ('COMM_INDUSTRIAL_ZINC',     'asset_classes', 'COMM_INDUSTRIAL', 'Zinc',                  'COMM_INDUSTRIAL_ZINC',     '#f6e2a0', 4),
  ('COMM_INDUSTRIAL_LITHIUM',  'asset_classes', 'COMM_INDUSTRIAL', 'Lithium',  'COMM_INDUSTRIAL_LITHIUM',  '#f9ecb8', 5),
  ('COMM_INDUSTRIAL_OTHER',    'asset_classes', 'COMM_INDUSTRIAL', 'Other Industrial Metals','COMM_INDUSTRIAL_OTHER',    '#fcf5d0', 6);


-- Agriculture — Level 3
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('COMM_AGRICULTURE_GRAINS',   'asset_classes', 'COMM_AGRICULTURE', 'Grains',   'COMM_AGRICULTURE_GRAINS',   '#f6e2a0', 1),
  ('COMM_AGRICULTURE_SOFTS',    'asset_classes', 'COMM_AGRICULTURE', 'Softs',    'COMM_AGRICULTURE_SOFTS',    '#f9ecb8', 2),
  ('COMM_AGRICULTURE_OILSEEDS', 'asset_classes', 'COMM_AGRICULTURE', 'Oilseeds', 'COMM_AGRICULTURE_OILSEEDS', '#fcf5d0', 3);

-- Livestock — Level 3
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('COMM_LIVESTOCK_CATTLE', 'asset_classes', 'COMM_LIVESTOCK', 'Cattle', 'COMM_LIVESTOCK_CATTLE', '#f9ecb8', 1),
  ('COMM_LIVESTOCK_HOGS',   'asset_classes', 'COMM_LIVESTOCK', 'Hogs',   'COMM_LIVESTOCK_HOGS',   '#fcf5d0', 2);



-- ============================================================================
-- ALTERNATIVES (7 children + 9 grandchildren = 16) - Purple variants
-- ============================================================================
-- ALTERNATIVES — Level 2 (clean, no wrappers)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('ALT_HEDGE_FUNDS',     'asset_classes', 'ALTERNATIVES', 'Hedge Funds',                  'ALT_HEDGE_FUNDS',     '#a699d0', 1),
  ('ALT_PRIVATE_EQUITY',  'asset_classes', 'ALTERNATIVES', 'Private Equity',               'ALT_PRIVATE_EQUITY',  '#afa4d5', 2),
  ('ALT_PRIVATE_CREDIT',  'asset_classes', 'ALTERNATIVES', 'Private Credit',               'ALT_PRIVATE_CREDIT',  '#b8afda', 3),
  ('ALT_INFRASTRUCTURE',  'asset_classes', 'ALTERNATIVES', 'Infrastructure',               'ALT_INFRASTRUCTURE',  '#c4b9e0', 4),
  ('ALT_REAL_ASSETS',     'asset_classes', 'ALTERNATIVES', 'Real Assets (Other)',          'ALT_REAL_ASSETS',     '#cfc4e5', 5),
  ('ALT_ILS',             'asset_classes', 'ALTERNATIVES', 'Insurance-Linked Securities',  'ALT_ILS',             '#dacfea', 6),
  ('ALT_COLLECTIBLES',    'asset_classes', 'ALTERNATIVES', 'Collectibles',                 'ALT_COLLECTIBLES',    '#e5daef', 7);

-- Level 2: Collectibles children (3)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('ALT_COLLECT_ART',       'asset_classes', 'ALT_COLLECTIBLES', 'Art',       'ALT_COLLECT_ART',       '#e5daef', 1),
  ('ALT_COLLECT_WINE',      'asset_classes', 'ALT_COLLECTIBLES', 'Wine',      'ALT_COLLECT_WINE',      '#ebe2f3', 2),
  ('ALT_COLLECT_TANGIBLES', 'asset_classes', 'ALT_COLLECTIBLES', 'Tangibles', 'ALT_COLLECT_TANGIBLES', '#f0e9f6', 3);



-- ============================================================================
-- DIGITAL ASSETS - Magenta variants
-- ============================================================================
-- Level 1
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('DA_CRYPTO',        'asset_classes', 'DIGITAL_ASSETS', 'Cryptocurrencies',            'DA_CRYPTO',        '#e47da8', 1),
  ('DA_STABLECOINS',   'asset_classes', 'DIGITAL_ASSETS', 'Stablecoins',                 'DA_STABLECOINS',   '#e88db3', 2),
  ('DA_DEFI',          'asset_classes', 'DIGITAL_ASSETS', 'DeFi',                        'DA_DEFI',          '#ec9dbe', 3),
  ('DA_NFTS',          'asset_classes', 'DIGITAL_ASSETS', 'NFTs',                        'DA_NFTS',          '#fccfda', 4),
  ('DA_RWA',           'asset_classes', 'DIGITAL_ASSETS', 'Tokenized Real-World Assets', 'DA_RWA',           '#f8b9d1', 5);

-- Level 2: Cryptocurrencies (keep simple + chart-friendly)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('DA_CRYPTO_PAYMENTS',     'asset_classes', 'DA_CRYPTO', 'Payments / Store of Value', 'DA_CRYPTO_PAYMENTS',     '#f4a4c2', 1),
  ('DA_CRYPTO_LAYER1',       'asset_classes', 'DA_CRYPTO', 'Layer 1',                   'DA_CRYPTO_LAYER1',       '#f8b9d1', 2),
  ('DA_CRYPTO_LAYER2',       'asset_classes', 'DA_CRYPTO', 'Layer 2',                   'DA_CRYPTO_LAYER2',       '#fccfda', 3);

-- Level 2: Stablecoins (industry-standard breakdown)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('DA_STABLECOIN_FIAT',      'asset_classes', 'DA_STABLECOINS', 'Fiat-Backed',       'DA_STABLECOIN_FIAT',      '#f4a4c2', 1),
  ('DA_STABLECOIN_CRYPTO',    'asset_classes', 'DA_STABLECOINS', 'Crypto-Backed',     'DA_STABLECOIN_CRYPTO',    '#f8b9d1', 2),
  ('DA_STABLECOIN_ALGO',      'asset_classes', 'DA_STABLECOINS', 'Algorithmic',       'DA_STABLECOIN_ALGO',      '#fccfda', 3);


-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS, post–Mar 17 2023 structure) - Energy (Yellow)
-- Flattened: removed redundant Industry Group 1010 (same name as Sector)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('10', 'industries_gics', NULL, 'Energy', '10', '#d0a215', 1),
  ('101010', 'industries_gics', '10', 'Energy Equipment & Services', '101010', '#eccb60', 1),
  ('10101010', 'industries_gics', '101010', 'Oil & Gas Drilling', '10101010', '#f6e2a0', 1),
  ('10101020', 'industries_gics', '101010', 'Oil & Gas Equipment & Services', '10101020', '#f6e2a0', 2),
  ('101020', 'industries_gics', '10', 'Oil, Gas & Consumable Fuels', '101020', '#eccb60', 2),
  ('10102010', 'industries_gics', '101020', 'Integrated Oil & Gas', '10102010', '#f6e2a0', 1),
  ('10102020', 'industries_gics', '101020', 'Oil & Gas Exploration & Production', '10102020', '#f6e2a0', 2),
  ('10102030', 'industries_gics', '101020', 'Oil & Gas Refining & Marketing', '10102030', '#f6e2a0', 3),
  ('10102040', 'industries_gics', '101020', 'Oil & Gas Storage & Transportation', '10102040', '#f6e2a0', 4),
  ('10102050', 'industries_gics', '101020', 'Coal & Consumable Fuels', '10102050', '#f6e2a0', 5);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Materials (Orange)
-- Flattened: removed redundant Industry Group 1510 (same name as Sector)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('15', 'industries_gics', NULL, 'Materials', '15', '#da702c', 2),
  ('151010', 'industries_gics', '15', 'Chemicals', '151010', '#f9ae77', 1),
  ('15101010', 'industries_gics', '151010', 'Commodity Chemicals', '15101010', '#fed3af', 1),
  ('15101020', 'industries_gics', '151010', 'Diversified Chemicals', '15101020', '#fed3af', 2),
  ('15101030', 'industries_gics', '151010', 'Fertilizers & Agricultural Chemicals', '15101030', '#fed3af', 3),
  ('15101040', 'industries_gics', '151010', 'Industrial Gases', '15101040', '#fed3af', 4),
  ('15101050', 'industries_gics', '151010', 'Specialty Chemicals', '15101050', '#fed3af', 5),
  ('151020', 'industries_gics', '15', 'Construction Materials', '151020', '#f9ae77', 2),
  ('15102010', 'industries_gics', '151020', 'Construction Materials', '15102010', '#fed3af', 1),
  ('151030', 'industries_gics', '15', 'Containers & Packaging', '151030', '#f9ae77', 3),
  ('15103010', 'industries_gics', '151030', 'Metal & Glass Containers', '15103010', '#fed3af', 1),
  ('15103020', 'industries_gics', '151030', 'Paper Packaging', '15103020', '#fed3af', 2),
  ('151040', 'industries_gics', '15', 'Metals & Mining', '151040', '#f9ae77', 4),
  ('15104010', 'industries_gics', '151040', 'Aluminum', '15104010', '#fed3af', 1),
  ('15104020', 'industries_gics', '151040', 'Diversified Metals & Mining', '15104020', '#fed3af', 2),
  ('15104025', 'industries_gics', '151040', 'Copper', '15104025', '#fed3af', 3),
  ('15104030', 'industries_gics', '151040', 'Gold', '15104030', '#fed3af', 4),
  ('15104040', 'industries_gics', '151040', 'Precious Metals & Minerals', '15104040', '#fed3af', 5),
  ('15104045', 'industries_gics', '151040', 'Silver', '15104045', '#fed3af', 6),
  ('15104050', 'industries_gics', '151040', 'Steel', '15104050', '#fed3af', 7),
  ('151050', 'industries_gics', '15', 'Paper & Forest Products', '151050', '#f9ae77', 5),
  ('15105010', 'industries_gics', '151050', 'Forest Products', '15105010', '#fed3af', 1),
  ('15105020', 'industries_gics', '151050', 'Paper Products', '15105020', '#fed3af', 2);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Industrials (Green)
-- (includes 20202030 Data Processing & Outsourced Services per 2023 changes)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('20', 'industries_gics', NULL, 'Industrials', '20', '#879a39', 3),

  ('2010', 'industries_gics', '20', 'Capital Goods', '2010', '#a0af54', 1),
  ('201010', 'industries_gics', '2010', 'Aerospace & Defense', '201010', '#bec97e', 1),
  ('20101010', 'industries_gics', '201010', 'Aerospace & Defense', '20101010', '#dde2b2', 1),
  ('201020', 'industries_gics', '2010', 'Building Products', '201020', '#bec97e', 2),
  ('20102010', 'industries_gics', '201020', 'Building Products', '20102010', '#dde2b2', 1),
  ('201030', 'industries_gics', '2010', 'Construction & Engineering', '201030', '#bec97e', 3),
  ('20103010', 'industries_gics', '201030', 'Construction & Engineering', '20103010', '#dde2b2', 1),
  ('201040', 'industries_gics', '2010', 'Electrical Equipment', '201040', '#bec97e', 4),
  ('20104010', 'industries_gics', '201040', 'Electrical Components & Equipment', '20104010', '#dde2b2', 1),
  ('20104020', 'industries_gics', '201040', 'Heavy Electrical Equipment', '20104020', '#dde2b2', 2),
  ('201050', 'industries_gics', '2010', 'Industrial Conglomerates', '201050', '#bec97e', 5),
  ('20105010', 'industries_gics', '201050', 'Industrial Conglomerates', '20105010', '#dde2b2', 1),
  ('201060', 'industries_gics', '2010', 'Machinery', '201060', '#bec97e', 6),
  ('20106010', 'industries_gics', '201060', 'Construction Machinery & Heavy Trucks', '20106010', '#dde2b2', 1),
  ('20106015', 'industries_gics', '201060', 'Agricultural & Farm Machinery', '20106015', '#dde2b2', 2),
  ('20106020', 'industries_gics', '201060', 'Industrial Machinery', '20106020', '#dde2b2', 3),
  ('201070', 'industries_gics', '2010', 'Trading Companies & Distributors', '201070', '#bec97e', 7),
  ('20107010', 'industries_gics', '201070', 'Trading Companies & Distributors', '20107010', '#dde2b2', 1),

  ('2020', 'industries_gics', '20', 'Commercial & Professional Services', '2020', '#a0af54', 2),
  ('202010', 'industries_gics', '2020', 'Commercial Services & Supplies', '202010', '#bec97e', 1),
  ('20201010', 'industries_gics', '202010', 'Commercial Printing', '20201010', '#dde2b2', 1),
  ('20201050', 'industries_gics', '202010', 'Environmental & Facilities Services', '20201050', '#dde2b2', 2),
  ('20201060', 'industries_gics', '202010', 'Office Services & Supplies', '20201060', '#dde2b2', 3),
  ('20201070', 'industries_gics', '202010', 'Diversified Support Services', '20201070', '#dde2b2', 4),
  ('20201080', 'industries_gics', '202010', 'Security & Alarm Services', '20201080', '#dde2b2', 5),

  ('202020', 'industries_gics', '2020', 'Professional Services', '202020', '#bec97e', 2),
  ('20202010', 'industries_gics', '202020', 'Human Resource & Employment Services', '20202010', '#dde2b2', 1),
  ('20202020', 'industries_gics', '202020', 'Research & Consulting Services', '20202020', '#dde2b2', 2),
  ('20202030', 'industries_gics', '202020', 'Data Processing & Outsourced Services', '20202030', '#dde2b2', 3),

  ('2030', 'industries_gics', '20', 'Transportation', '2030', '#a0af54', 3),
  ('203010', 'industries_gics', '2030', 'Air Freight & Logistics', '203010', '#bec97e', 1),
  ('20301010', 'industries_gics', '203010', 'Air Freight & Logistics', '20301010', '#dde2b2', 1),

  ('203020', 'industries_gics', '2030', 'Passenger Airlines', '203020', '#bec97e', 2),
  ('20302010', 'industries_gics', '203020', 'Passenger Airlines', '20302010', '#dde2b2', 1),

  ('203030', 'industries_gics', '2030', 'Marine', '203030', '#bec97e', 3),
  ('20303010', 'industries_gics', '203030', 'Marine', '20303010', '#dde2b2', 1),

  ('203040', 'industries_gics', '2030', 'Road & Rail', '203040', '#bec97e', 4),
  ('20304010', 'industries_gics', '203040', 'Railroads', '20304010', '#dde2b2', 1),
  ('20304030', 'industries_gics', '203040', 'Cargo Ground Transportation', '20304030', '#dde2b2', 2),
  ('20304040', 'industries_gics', '203040', 'Passenger Ground Transportation', '20304040', '#dde2b2', 3),

  ('203050', 'industries_gics', '2030', 'Transportation Infrastructure', '203050', '#bec97e', 5),
  ('20305010', 'industries_gics', '203050', 'Airport Services', '20305010', '#dde2b2', 1),
  ('20305020', 'industries_gics', '203050', 'Highways & Railtracks', '20305020', '#dde2b2', 2),
  ('20305030', 'industries_gics', '203050', 'Marine Ports & Services', '20305030', '#dde2b2', 3);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Consumer Discretionary (Cyan)
-- (Retailing renamed; IDM retail removed; Broadline Retail added)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('25', 'industries_gics', NULL, 'Consumer Discretionary', '25', '#3aa99f', 4),

  ('2510', 'industries_gics', '25', 'Automobiles & Components', '2510', '#5abdac', 1),
  ('251010', 'industries_gics', '2510', 'Auto Components', '251010', '#87d3c3', 1),
  ('25101010', 'industries_gics', '251010', 'Auto Parts & Equipment', '25101010', '#bfe8d9', 1),
  ('25101020', 'industries_gics', '251010', 'Tires & Rubber', '25101020', '#bfe8d9', 2),
  ('251020', 'industries_gics', '2510', 'Automobiles', '251020', '#87d3c3', 2),
  ('25102010', 'industries_gics', '251020', 'Automobile Manufacturers', '25102010', '#bfe8d9', 1),
  ('25102020', 'industries_gics', '251020', 'Motorcycle Manufacturers', '25102020', '#bfe8d9', 2),

  ('2520', 'industries_gics', '25', 'Consumer Durables & Apparel', '2520', '#5abdac', 2),
  ('252010', 'industries_gics', '2520', 'Household Durables', '252010', '#87d3c3', 1),
  ('25201010', 'industries_gics', '252010', 'Consumer Electronics', '25201010', '#bfe8d9', 1),
  ('25201020', 'industries_gics', '252010', 'Home Furnishings', '25201020', '#bfe8d9', 2),
  ('25201030', 'industries_gics', '252010', 'Homebuilding', '25201030', '#bfe8d9', 3),
  ('25201040', 'industries_gics', '252010', 'Household Appliances', '25201040', '#bfe8d9', 4),
  ('25201050', 'industries_gics', '252010', 'Housewares & Specialties', '25201050', '#bfe8d9', 5),
  ('252020', 'industries_gics', '2520', 'Leisure Products', '252020', '#87d3c3', 2),
  ('25202010', 'industries_gics', '252020', 'Leisure Products', '25202010', '#bfe8d9', 1),
  ('252030', 'industries_gics', '2520', 'Textiles, Apparel & Luxury Goods', '252030', '#87d3c3', 3),
  ('25203010', 'industries_gics', '252030', 'Apparel, Accessories & Luxury Goods', '25203010', '#bfe8d9', 1),
  ('25203020', 'industries_gics', '252030', 'Footwear', '25203020', '#bfe8d9', 2),
  ('25203030', 'industries_gics', '252030', 'Textiles', '25203030', '#bfe8d9', 3),

  ('2530', 'industries_gics', '25', 'Consumer Services', '2530', '#5abdac', 3),
  ('253010', 'industries_gics', '2530', 'Hotels, Restaurants & Leisure', '253010', '#87d3c3', 1),
  ('25301010', 'industries_gics', '253010', 'Casinos & Gaming', '25301010', '#bfe8d9', 1),
  ('25301020', 'industries_gics', '253010', 'Hotels, Resorts & Cruise Lines', '25301020', '#bfe8d9', 2),
  ('25301030', 'industries_gics', '253010', 'Leisure Facilities', '25301030', '#bfe8d9', 3),
  ('25301040', 'industries_gics', '253010', 'Restaurants', '25301040', '#bfe8d9', 4),
  ('253020', 'industries_gics', '2530', 'Diversified Consumer Services', '253020', '#87d3c3', 2),
  ('25302010', 'industries_gics', '253020', 'Education Services', '25302010', '#bfe8d9', 1),
  ('25302020', 'industries_gics', '253020', 'Specialized Consumer Services', '25302020', '#bfe8d9', 2),

  ('2550', 'industries_gics', '25', 'Consumer Discretionary Distribution & Retail', '2550', '#5abdac', 4),
  ('255010', 'industries_gics', '2550', 'Distributors', '255010', '#87d3c3', 1),
  ('25501010', 'industries_gics', '255010', 'Distributors', '25501010', '#bfe8d9', 1),

  ('255030', 'industries_gics', '2550', 'Broadline Retail', '255030', '#87d3c3', 2),
  ('25503030', 'industries_gics', '255030', 'Broadline Retail', '25503030', '#bfe8d9', 1),

  ('255040', 'industries_gics', '2550', 'Specialty Retail', '255040', '#87d3c3', 3),
  ('25504010', 'industries_gics', '255040', 'Apparel Retail', '25504010', '#bfe8d9', 1),
  ('25504020', 'industries_gics', '255040', 'Computer & Electronics Retail', '25504020', '#bfe8d9', 2),
  ('25504030', 'industries_gics', '255040', 'Home Improvement Retail', '25504030', '#bfe8d9', 3),
  ('25504040', 'industries_gics', '255040', 'Other Specialty Retail', '25504040', '#bfe8d9', 4),
  ('25504050', 'industries_gics', '255040', 'Automotive Retail', '25504050', '#bfe8d9', 5),
  ('25504060', 'industries_gics', '255040', 'Homefurnishing Retail', '25504060', '#bfe8d9', 6);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Consumer Staples (Blue)
-- (3010/301010 renamed; 30101040 renamed)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('30', 'industries_gics', NULL, 'Consumer Staples', '30', '#4385be', 5),

  ('3010', 'industries_gics', '30', 'Consumer Staples Distribution & Retail', '3010', '#66a0c8', 1),
  ('301010', 'industries_gics', '3010', 'Consumer Staples Distribution & Retail', '301010', '#92bfdb', 1),
  ('30101010', 'industries_gics', '301010', 'Drug Retail', '30101010', '#c6dde8', 1),
  ('30101020', 'industries_gics', '301010', 'Food Distributors', '30101020', '#c6dde8', 2),
  ('30101030', 'industries_gics', '301010', 'Food Retail', '30101030', '#c6dde8', 3),
  ('30101040', 'industries_gics', '301010', 'Consumer Staples Merchandise Retail', '30101040', '#c6dde8', 4),

  ('3020', 'industries_gics', '30', 'Food, Beverage & Tobacco', '3020', '#66a0c8', 2),
  ('302010', 'industries_gics', '3020', 'Beverages', '302010', '#92bfdb', 1),
  ('30201010', 'industries_gics', '302010', 'Brewers', '30201010', '#c6dde8', 1),
  ('30201020', 'industries_gics', '302010', 'Distillers & Vintners', '30201020', '#c6dde8', 2),
  ('30201030', 'industries_gics', '302010', 'Soft Drinks', '30201030', '#c6dde8', 3),
  ('302020', 'industries_gics', '3020', 'Food Products', '302020', '#92bfdb', 2),
  ('30202010', 'industries_gics', '302020', 'Agricultural Products', '30202010', '#c6dde8', 1),
  ('30202030', 'industries_gics', '302020', 'Packaged Foods & Meats', '30202030', '#c6dde8', 2),
  ('302030', 'industries_gics', '3020', 'Tobacco', '302030', '#92bfdb', 3),
  ('30203010', 'industries_gics', '302030', 'Tobacco', '30203010', '#c6dde8', 1),

  ('3030', 'industries_gics', '30', 'Household & Personal Products', '3030', '#66a0c8', 3),
  ('303010', 'industries_gics', '3030', 'Household Products', '303010', '#92bfdb', 1),
  ('30301010', 'industries_gics', '303010', 'Household Products', '30301010', '#c6dde8', 1),
  ('303020', 'industries_gics', '3030', 'Personal Products', '303020', '#92bfdb', 2),
  ('30302010', 'industries_gics', '303020', 'Personal Products', '30302010', '#c6dde8', 1);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Health Care (Purple)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('35', 'industries_gics', NULL, 'Health Care', '35', '#8b7ec8', 6),
  ('3510', 'industries_gics', '35', 'Health Care Equipment & Services', '3510', '#a699d0', 1),
  ('351010', 'industries_gics', '3510', 'Health Care Equipment & Supplies', '351010', '#c4b9e0', 1),
  ('35101010', 'industries_gics', '351010', 'Health Care Equipment', '35101010', '#e2d9e9', 1),
  ('35101020', 'industries_gics', '351010', 'Health Care Supplies', '35101020', '#e2d9e9', 2),
  ('351020', 'industries_gics', '3510', 'Health Care Providers & Services', '351020', '#c4b9e0', 2),
  ('35102010', 'industries_gics', '351020', 'Health Care Distributors', '35102010', '#e2d9e9', 1),
  ('35102015', 'industries_gics', '351020', 'Health Care Services', '35102015', '#e2d9e9', 2),
  ('35102020', 'industries_gics', '351020', 'Health Care Facilities', '35102020', '#e2d9e9', 3),
  ('35102030', 'industries_gics', '351020', 'Managed Health Care', '35102030', '#e2d9e9', 4),
  ('351030', 'industries_gics', '3510', 'Health Care Technology', '351030', '#c4b9e0', 3),
  ('35103010', 'industries_gics', '351030', 'Health Care Technology', '35103010', '#e2d9e9', 1),

  ('3520', 'industries_gics', '35', 'Pharmaceuticals, Biotechnology & Life Sciences', '3520', '#a699d0', 2),
  ('352010', 'industries_gics', '3520', 'Biotechnology', '352010', '#c4b9e0', 1),
  ('35201010', 'industries_gics', '352010', 'Biotechnology', '35201010', '#e2d9e9', 1),
  ('352020', 'industries_gics', '3520', 'Pharmaceuticals', '352020', '#c4b9e0', 2),
  ('35202010', 'industries_gics', '352020', 'Pharmaceuticals', '35202010', '#e2d9e9', 1),
  ('352030', 'industries_gics', '3520', 'Life Sciences Tools & Services', '352030', '#c4b9e0', 3),
  ('35203010', 'industries_gics', '352030', 'Life Sciences Tools & Services', '35203010', '#e2d9e9', 1);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Financials (Magenta)
-- (4020 renamed; Thrifts & Mortgage Finance removed; 40201050/60 added)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('40', 'industries_gics', NULL, 'Financials', '40', '#ce5d97', 7),

  ('4010', 'industries_gics', '40', 'Banks', '4010', '#e47da8', 1),
  ('401010', 'industries_gics', '4010', 'Banks', '401010', '#f4a4c2', 1),
  ('40101010', 'industries_gics', '401010', 'Diversified Banks', '40101010', '#fccfda', 1),
  ('40101015', 'industries_gics', '401010', 'Regional Banks', '40101015', '#fccfda', 2),

  ('4020', 'industries_gics', '40', 'Financial Services', '4020', '#e47da8', 2),
  ('402010', 'industries_gics', '4020', 'Financial Services', '402010', '#f4a4c2', 1),
  ('40201020', 'industries_gics', '402010', 'Diversified Financial Services', '40201020', '#fccfda', 1),
  ('40201030', 'industries_gics', '402010', 'Multi-Sector Holdings', '40201030', '#fccfda', 2),
  ('40201040', 'industries_gics', '402010', 'Specialized Finance', '40201040', '#fccfda', 3),
  ('40201050', 'industries_gics', '402010', 'Commercial & Residential Mortgage Finance', '40201050', '#fccfda', 4),
  ('40201060', 'industries_gics', '402010', 'Transaction & Payment Processing Services', '40201060', '#fccfda', 5),

  ('402020', 'industries_gics', '4020', 'Consumer Finance', '402020', '#f4a4c2', 2),
  ('40202010', 'industries_gics', '402020', 'Consumer Finance', '40202010', '#fccfda', 1),

  ('402030', 'industries_gics', '4020', 'Capital Markets', '402030', '#f4a4c2', 3),
  ('40203010', 'industries_gics', '402030', 'Asset Management & Custody Banks', '40203010', '#fccfda', 1),
  ('40203020', 'industries_gics', '402030', 'Investment Banking & Brokerage', '40203020', '#fccfda', 2),
  ('40203030', 'industries_gics', '402030', 'Diversified Capital Markets', '40203030', '#fccfda', 3),
  ('40203040', 'industries_gics', '402030', 'Financial Exchanges & Data', '40203040', '#fccfda', 4),

  ('402040', 'industries_gics', '4020', 'Mortgage Real Estate Investment Trusts (REITs)', '402040', '#f4a4c2', 4),
  ('40204010', 'industries_gics', '402040', 'Mortgage REITs', '40204010', '#fccfda', 1),

  ('4030', 'industries_gics', '40', 'Insurance', '4030', '#e47da8', 3),
  ('403010', 'industries_gics', '4030', 'Insurance', '403010', '#f4a4c2', 1),
  ('40301010', 'industries_gics', '403010', 'Insurance Brokers', '40301010', '#fccfda', 1),
  ('40301020', 'industries_gics', '403010', 'Life & Health Insurance', '40301020', '#fccfda', 2),
  ('40301030', 'industries_gics', '403010', 'Multi-line Insurance', '40301030', '#fccfda', 3),
  ('40301040', 'industries_gics', '403010', 'Property & Casualty Insurance', '40301040', '#fccfda', 4),
  ('40301050', 'industries_gics', '403010', 'Reinsurance', '40301050', '#fccfda', 5);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Information Technology (Purple-dark)
-- (adds 451010; removes 45102020)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('45', 'industries_gics', NULL, 'Information Technology', '45', '#5e409d', 8),

  ('4510', 'industries_gics', '45', 'Software & Services', '4510', '#735eb5', 1),
  ('451010', 'industries_gics', '4510', 'Internet Software & Services', '451010', '#8b7ec8', 1),
  ('45101010', 'industries_gics', '451010', 'Internet Software & Services', '45101010', '#a699d0', 1),

  ('451020', 'industries_gics', '4510', 'IT Services', '451020', '#8b7ec8', 2),
  ('45102010', 'industries_gics', '451020', 'IT Consulting & Other Services', '45102010', '#a699d0', 1),
  ('45102030', 'industries_gics', '451020', 'Internet Services & Infrastructure', '45102030', '#a699d0', 2),

  ('451030', 'industries_gics', '4510', 'Software', '451030', '#8b7ec8', 3),
  ('45103010', 'industries_gics', '451030', 'Application Software', '45103010', '#a699d0', 1),
  ('45103020', 'industries_gics', '451030', 'Systems Software', '45103020', '#a699d0', 2),

  ('4520', 'industries_gics', '45', 'Technology Hardware & Equipment', '4520', '#735eb5', 2),
  ('452010', 'industries_gics', '4520', 'Communications Equipment', '452010', '#8b7ec8', 1),
  ('45201020', 'industries_gics', '452010', 'Communications Equipment', '45201020', '#a699d0', 1),
  ('452020', 'industries_gics', '4520', 'Technology Hardware, Storage & Peripherals', '452020', '#8b7ec8', 2),
  ('45202030', 'industries_gics', '452020', 'Technology Hardware, Storage & Peripherals', '45202030', '#a699d0', 1),
  ('452030', 'industries_gics', '4520', 'Electronic Equipment, Instruments & Components', '452030', '#8b7ec8', 3),
  ('45203010', 'industries_gics', '452030', 'Electronic Equipment & Instruments', '45203010', '#a699d0', 1),
  ('45203015', 'industries_gics', '452030', 'Electronic Components', '45203015', '#a699d0', 2),
  ('45203020', 'industries_gics', '452030', 'Electronic Manufacturing Services', '45203020', '#a699d0', 3),
  ('45203030', 'industries_gics', '452030', 'Technology Distributors', '45203030', '#a699d0', 4),

  ('4530', 'industries_gics', '45', 'Semiconductors & Semiconductor Equipment', '4530', '#735eb5', 3),
  ('453010', 'industries_gics', '4530', 'Semiconductors & Semiconductor Equipment', '453010', '#8b7ec8', 1),
  ('45301010', 'industries_gics', '453010', 'Semiconductor Equipment', '45301010', '#a699d0', 1),
  ('45301020', 'industries_gics', '453010', 'Semiconductors', '45301020', '#a699d0', 2);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Communication Services (Magenta-dark)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('50', 'industries_gics', NULL, 'Communication Services', '50', '#a02f6f', 9),
  ('5010', 'industries_gics', '50', 'Telecommunication Services', '5010', '#b74583', 1),
  ('501010', 'industries_gics', '5010', 'Diversified Telecommunication Services', '501010', '#ce5d97', 1),
  ('50101010', 'industries_gics', '501010', 'Alternative Carriers', '50101010', '#e47da8', 1),
  ('50101020', 'industries_gics', '501010', 'Integrated Telecommunication Services', '50101020', '#e47da8', 2),
  ('501020', 'industries_gics', '5010', 'Wireless Telecommunication Services', '501020', '#ce5d97', 2),
  ('50102010', 'industries_gics', '501020', 'Wireless Telecommunication Services', '50102010', '#e47da8', 1),
  ('5020', 'industries_gics', '50', 'Media & Entertainment', '5020', '#b74583', 2),
  ('502010', 'industries_gics', '5020', 'Media', '502010', '#ce5d97', 1),
  ('50201010', 'industries_gics', '502010', 'Advertising', '50201010', '#e47da8', 1),
  ('50201020', 'industries_gics', '502010', 'Broadcasting', '50201020', '#e47da8', 2),
  ('50201030', 'industries_gics', '502010', 'Cable & Satellite', '50201030', '#e47da8', 3),
  ('50201040', 'industries_gics', '502010', 'Publishing', '50201040', '#e47da8', 4),
  ('502020', 'industries_gics', '5020', 'Entertainment', '502020', '#ce5d97', 2),
  ('50202010', 'industries_gics', '502020', 'Movies & Entertainment', '50202010', '#e47da8', 1),
  ('50202020', 'industries_gics', '502020', 'Interactive Home Entertainment', '50202020', '#e47da8', 2),
  ('502030', 'industries_gics', '5020', 'Interactive Media & Services', '502030', '#ce5d97', 3),
  ('50203010', 'industries_gics', '502030', 'Interactive Media & Services', '50203010', '#e47da8', 1);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Utilities (Red)
-- Flattened: removed redundant Industry Group 5510 (same name as Sector)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('55', 'industries_gics', NULL, 'Utilities', '55', '#d14d41', 10),
  ('551010', 'industries_gics', '55', 'Electric Utilities', '551010', '#f89a8a', 1),
  ('55101010', 'industries_gics', '551010', 'Electric Utilities', '55101010', '#ffcabb', 1),
  ('551020', 'industries_gics', '55', 'Gas Utilities', '551020', '#f89a8a', 2),
  ('55102010', 'industries_gics', '551020', 'Gas Utilities', '55102010', '#ffcabb', 1),
  ('551030', 'industries_gics', '55', 'Multi-Utilities', '551030', '#f89a8a', 3),
  ('55103010', 'industries_gics', '551030', 'Multi-Utilities', '55103010', '#ffcabb', 1),
  ('551040', 'industries_gics', '55', 'Water Utilities', '551040', '#f89a8a', 4),
  ('55104010', 'industries_gics', '551040', 'Water Utilities', '55104010', '#ffcabb', 1),
  ('551050', 'industries_gics', '55', 'Independent Power and Renewable Electricity Producers', '551050', '#f89a8a', 5),
  ('55105010', 'industries_gics', '551050', 'Independent Power Producers & Energy Traders', '55105010', '#ffcabb', 1),
  ('55105020', 'industries_gics', '551050', 'Renewable Electricity', '55105020', '#ffcabb', 2);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Real Estate (Orange-dark)
-- (2023 restructure: 6010 Equity REITs + 6020 Real Estate Management & Development)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
  ('60', 'industries_gics', NULL, 'Real Estate', '60', '#bc5215', 11),

  ('6010', 'industries_gics', '60', 'Equity Real Estate Investment Trusts (REITs)', '6010', '#cb6120', 1),

  ('601010', 'industries_gics', '6010', 'Diversified REITs', '601010', '#da702c', 1),
  ('60101010', 'industries_gics', '601010', 'Diversified REITs', '60101010', '#ec8b49', 1),

  ('601025', 'industries_gics', '6010', 'Industrial REITs', '601025', '#da702c', 2),
  ('60102510', 'industries_gics', '601025', 'Industrial REITs', '60102510', '#ec8b49', 1),

  ('601030', 'industries_gics', '6010', 'Hotel & Resort REITs', '601030', '#da702c', 3),
  ('60103010', 'industries_gics', '601030', 'Hotel & Resort REITs', '60103010', '#ec8b49', 1),

  ('601040', 'industries_gics', '6010', 'Office REITs', '601040', '#da702c', 4),
  ('60104010', 'industries_gics', '601040', 'Office REITs', '60104010', '#ec8b49', 1),

  ('601050', 'industries_gics', '6010', 'Health Care REITs', '601050', '#da702c', 5),
  ('60105010', 'industries_gics', '601050', 'Health Care REITs', '60105010', '#ec8b49', 1),

  ('601060', 'industries_gics', '6010', 'Residential REITs', '601060', '#da702c', 6),
  ('60106010', 'industries_gics', '601060', 'Multi-Family Residential REITs', '60106010', '#ec8b49', 1),
  ('60106020', 'industries_gics', '601060', 'Single-Family Residential REITs', '60106020', '#ec8b49', 2),

  ('601070', 'industries_gics', '6010', 'Retail REITs', '601070', '#da702c', 7),
  ('60107010', 'industries_gics', '601070', 'Retail REITs', '60107010', '#ec8b49', 1),

  ('601080', 'industries_gics', '6010', 'Specialized REITs', '601080', '#da702c', 8),
  ('60108010', 'industries_gics', '601080', 'Other Specialized REITs', '60108010', '#ec8b49', 1),
  ('60108020', 'industries_gics', '601080', 'Self-Storage REITs', '60108020', '#ec8b49', 2),
  ('60108030', 'industries_gics', '601080', 'Telecom Tower REITs', '60108030', '#ec8b49', 3),
  ('60108040', 'industries_gics', '601080', 'Timber REITs', '60108040', '#ec8b49', 4),
  ('60108050', 'industries_gics', '601080', 'Data Center REITs', '60108050', '#ec8b49', 5),

  ('6020', 'industries_gics', '60', 'Real Estate Management & Development', '6020', '#cb6120', 2),
  ('602010', 'industries_gics', '6020', 'Real Estate Management & Development', '602010', '#da702c', 1),
  ('60201010', 'industries_gics', '602010', 'Diversified Real Estate Activities', '60201010', '#ec8b49', 1),
  ('60201020', 'industries_gics', '602010', 'Real Estate Operating Companies', '60201020', '#ec8b49', 2),
  ('60201030', 'industries_gics', '602010', 'Real Estate Development', '60201030', '#ec8b49', 3),
  ('60201040', 'industries_gics', '602010', 'Real Estate Services', '60201040', '#ec8b49', 4);


-- ============================================================================
-- REGIONS (UN-style names): Continent -> Sub-region -> Country/Territory
-- Colors preserved from your Flexoki palette choices.
-- ============================================================================

-- Continents (Level 0)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('R10', 'regions', NULL, 'Europe',   'R10', '#4385be', 1),
    ('R20', 'regions', NULL, 'Americas', 'R20', '#8b7ec8', 2),
    ('R30', 'regions', NULL, 'Asia',     'R30', '#ce5d97', 3),
    ('R40', 'regions', NULL, 'Africa',   'R40', '#3aa99f', 4),
    ('R50', 'regions', NULL, 'Oceania',  'R50', '#879a39', 5);

-- ============================================================================
-- EUROPE
-- ============================================================================

-- Europe Sub-regions (Level 1)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('R1010', 'regions', 'R10', 'Northern Europe', 'R1010', '#66a0c8', 1),
    ('R1020', 'regions', 'R10', 'Western Europe',  'R1020', '#92bfdb', 2),
    ('R1030', 'regions', 'R10', 'Eastern Europe',  'R1030', '#abcfe2', 3),
    ('R1040', 'regions', 'R10', 'Southern Europe', 'R1040', '#c6dde8', 4);

-- Northern Europe
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_DK', 'regions', 'R1010', 'Denmark',        'country_DK', '#c6dde8', 1),
    ('country_EE', 'regions', 'R1010', 'Estonia',        'country_EE', '#abcfe2', 2),
    ('country_FI', 'regions', 'R1010', 'Finland',        'country_FI', '#92bfdb', 3),
    ('country_GB', 'regions', 'R1010', 'United Kingdom', 'country_GB', '#66a0c8', 4),
    ('country_IS', 'regions', 'R1010', 'Iceland',        'country_IS', '#c6dde8', 5),
    ('country_IE', 'regions', 'R1010', 'Ireland',        'country_IE', '#abcfe2', 6),
    ('country_LV', 'regions', 'R1010', 'Latvia',         'country_LV', '#92bfdb', 7),
    ('country_LT', 'regions', 'R1010', 'Lithuania',      'country_LT', '#66a0c8', 8),
    ('country_NO', 'regions', 'R1010', 'Norway',         'country_NO', '#c6dde8', 9),
    ('country_SE', 'regions', 'R1010', 'Sweden',         'country_SE', '#abcfe2', 10);

-- Western Europe
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_AT', 'regions', 'R1020', 'Austria',      'country_AT', '#c6dde8', 1),
    ('country_BE', 'regions', 'R1020', 'Belgium',      'country_BE', '#abcfe2', 2),
    ('country_FR', 'regions', 'R1020', 'France',       'country_FR', '#92bfdb', 3),
    ('country_DE', 'regions', 'R1020', 'Germany',      'country_DE', '#66a0c8', 4),
    ('country_LI', 'regions', 'R1020', 'Liechtenstein','country_LI', '#c6dde8', 5),
    ('country_LU', 'regions', 'R1020', 'Luxembourg',   'country_LU', '#abcfe2', 6),
    ('country_MC', 'regions', 'R1020', 'Monaco',       'country_MC', '#92bfdb', 7),
    ('country_NL', 'regions', 'R1020', 'Netherlands',  'country_NL', '#66a0c8', 8),
    ('country_CH', 'regions', 'R1020', 'Switzerland',  'country_CH', '#c6dde8', 9);

-- Eastern Europe
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_BY', 'regions', 'R1030', 'Belarus',          'country_BY', '#c6dde8', 1),
    ('country_BG', 'regions', 'R1030', 'Bulgaria',         'country_BG', '#abcfe2', 2),
    ('country_CZ', 'regions', 'R1030', 'Czechia',          'country_CZ', '#92bfdb', 3),
    ('country_HU', 'regions', 'R1030', 'Hungary',          'country_HU', '#66a0c8', 4),
    ('country_PL', 'regions', 'R1030', 'Poland',           'country_PL', '#c6dde8', 5),
    ('country_RO', 'regions', 'R1030', 'Romania',          'country_RO', '#abcfe2', 6),
    ('country_RU', 'regions', 'R1030', 'Russian Federation','country_RU','#92bfdb', 7),
    ('country_SK', 'regions', 'R1030', 'Slovakia',         'country_SK', '#66a0c8', 8),
    ('country_UA', 'regions', 'R1030', 'Ukraine',          'country_UA', '#c6dde8', 9);

-- Southern Europe
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_AL', 'regions', 'R1040', 'Albania',                 'country_AL', '#c6dde8', 1),
    ('country_AD', 'regions', 'R1040', 'Andorra',                 'country_AD', '#abcfe2', 2),
    ('country_BA', 'regions', 'R1040', 'Bosnia and Herzegovina',  'country_BA', '#92bfdb', 3),
    ('country_HR', 'regions', 'R1040', 'Croatia',                 'country_HR', '#66a0c8', 4),
    ('country_GI', 'regions', 'R1040', 'Gibraltar',               'country_GI', '#c6dde8', 5),
    ('country_GR', 'regions', 'R1040', 'Greece',                  'country_GR', '#abcfe2', 6),
    ('country_IT', 'regions', 'R1040', 'Italy',                   'country_IT', '#92bfdb', 7),
    ('country_MT', 'regions', 'R1040', 'Malta',                   'country_MT', '#66a0c8', 8),
    ('country_ME', 'regions', 'R1040', 'Montenegro',              'country_ME', '#c6dde8', 9),
    ('country_PT', 'regions', 'R1040', 'Portugal',                'country_PT', '#abcfe2', 10),
    ('country_SM', 'regions', 'R1040', 'San Marino',              'country_SM', '#92bfdb', 11),
    ('country_RS', 'regions', 'R1040', 'Serbia',                  'country_RS', '#66a0c8', 12),
    ('country_ES', 'regions', 'R1040', 'Spain',                   'country_ES', '#c6dde8', 13),
    ('country_VA', 'regions', 'R1040', 'Holy See',                'country_VA', '#abcfe2', 14);

-- ============================================================================
-- AMERICAS
-- ============================================================================

-- Americas Sub-regions (Level 1)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('R2010', 'regions', 'R20', 'Northern America', 'R2010', '#a699d0', 1),
    ('R2020', 'regions', 'R20', 'Central America',  'R2020', '#c4b9e0', 2),
    ('R2030', 'regions', 'R20', 'Caribbean',        'R2030', '#d3cae6', 3),
    ('R2040', 'regions', 'R20', 'South America',    'R2040', '#e2d9e9', 4);

-- Northern America
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_BM', 'regions', 'R2010', 'Bermuda',                    'country_BM', '#d3cae6', 1),
    ('country_CA', 'regions', 'R2010', 'Canada',                     'country_CA', '#c4b9e0', 2),
    ('country_GL', 'regions', 'R2010', 'Greenland',                  'country_GL', '#a699d0', 3),
    ('country_MX', 'regions', 'R2010', 'Mexico',                     'country_MX', '#d3cae6', 4),
    ('country_PM', 'regions', 'R2010', 'Saint Pierre and Miquelon',  'country_PM', '#c4b9e0', 5),
    ('country_US', 'regions', 'R2010', 'United States',              'country_US', '#a699d0', 6);

-- Central America
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_BZ', 'regions', 'R2020', 'Belize',       'country_BZ', '#d3cae6', 1),
    ('country_CR', 'regions', 'R2020', 'Costa Rica',   'country_CR', '#c4b9e0', 2),
    ('country_SV', 'regions', 'R2020', 'El Salvador',  'country_SV', '#a699d0', 3),
    ('country_GT', 'regions', 'R2020', 'Guatemala',    'country_GT', '#d3cae6', 4),
    ('country_HN', 'regions', 'R2020', 'Honduras',     'country_HN', '#c4b9e0', 5),
    ('country_NI', 'regions', 'R2020', 'Nicaragua',    'country_NI', '#a699d0', 6),
    ('country_PA', 'regions', 'R2020', 'Panama',       'country_PA', '#d3cae6', 7);

-- Caribbean
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_VI', 'regions', 'R2030', 'Virgin Islands (U.S.)',            'country_VI', '#d3cae6', 1),
    ('country_AI', 'regions', 'R2030', 'Anguilla',                          'country_AI', '#c4b9e0', 2),
    ('country_AG', 'regions', 'R2030', 'Antigua and Barbuda',               'country_AG', '#a699d0', 3),
    ('country_AW', 'regions', 'R2030', 'Aruba',                             'country_AW', '#d3cae6', 4),
    ('country_BS', 'regions', 'R2030', 'Bahamas',                           'country_BS', '#c4b9e0', 5),
    ('country_BB', 'regions', 'R2030', 'Barbados',                          'country_BB', '#a699d0', 6),
    ('country_VG', 'regions', 'R2030', 'Virgin Islands (British)',          'country_VG', '#d3cae6', 7),
    ('country_KY', 'regions', 'R2030', 'Cayman Islands',                    'country_KY', '#c4b9e0', 8),
    ('country_CU', 'regions', 'R2030', 'Cuba',                              'country_CU', '#a699d0', 9),
    ('country_DM', 'regions', 'R2030', 'Dominica',                          'country_DM', '#d3cae6', 10),
    ('country_DO', 'regions', 'R2030', 'Dominican Republic',                'country_DO', '#c4b9e0', 11),
    ('country_GD', 'regions', 'R2030', 'Grenada',                           'country_GD', '#a699d0', 12),
    ('country_GP', 'regions', 'R2030', 'Guadeloupe',                        'country_GP', '#d3cae6', 13),
    ('country_HT', 'regions', 'R2030', 'Haiti',                             'country_HT', '#c4b9e0', 14),
    ('country_JM', 'regions', 'R2030', 'Jamaica',                           'country_JM', '#a699d0', 15),
    ('country_MQ', 'regions', 'R2030', 'Martinique',                        'country_MQ', '#d3cae6', 16),
    ('country_MS', 'regions', 'R2030', 'Montserrat',                        'country_MS', '#c4b9e0', 17),
    ('country_PR', 'regions', 'R2030', 'Puerto Rico',                       'country_PR', '#a699d0', 18),
    ('country_MF', 'regions', 'R2030', 'Saint Martin (French part)',        'country_MF', '#d3cae6', 19),
    ('country_SX', 'regions', 'R2030', 'Sint Maarten (Dutch part)',         'country_SX', '#c4b9e0', 20),
    ('country_BL', 'regions', 'R2030', 'Saint Barthélemy',                  'country_BL', '#a699d0', 21),
    ('country_KN', 'regions', 'R2030', 'Saint Kitts and Nevis',             'country_KN', '#d3cae6', 22),
    ('country_LC', 'regions', 'R2030', 'Saint Lucia',                       'country_LC', '#c4b9e0', 23),
    ('country_VC', 'regions', 'R2030', 'Saint Vincent and the Grenadines',  'country_VC', '#a699d0', 24),
    ('country_TT', 'regions', 'R2030', 'Trinidad and Tobago',               'country_TT', '#d3cae6', 25),
    ('country_TC', 'regions', 'R2030', 'Turks and Caicos Islands',          'country_TC', '#c4b9e0', 26);

-- South America
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_AR', 'regions', 'R2040', 'Argentina',                 'country_AR', '#d3cae6', 1),
    ('country_BO', 'regions', 'R2040', 'Bolivia',                   'country_BO', '#c4b9e0', 2),
    ('country_BR', 'regions', 'R2040', 'Brazil',                    'country_BR', '#a699d0', 3),
    ('country_CL', 'regions', 'R2040', 'Chile',                     'country_CL', '#d3cae6', 4),
    ('country_CO', 'regions', 'R2040', 'Colombia',                  'country_CO', '#c4b9e0', 5),
    ('country_EC', 'regions', 'R2040', 'Ecuador',                   'country_EC', '#a699d0', 6),
    ('country_FK', 'regions', 'R2040', 'Falkland Islands (Malvinas)','country_FK','#d3cae6', 7),
    ('country_GF', 'regions', 'R2040', 'French Guiana',             'country_GF', '#c4b9e0', 8),
    ('country_GY', 'regions', 'R2040', 'Guyana',                    'country_GY', '#a699d0', 9),
    ('country_PY', 'regions', 'R2040', 'Paraguay',                  'country_PY', '#d3cae6', 10),
    ('country_PE', 'regions', 'R2040', 'Peru',                      'country_PE', '#c4b9e0', 11),
    ('country_SR', 'regions', 'R2040', 'Suriname',                  'country_SR', '#a699d0', 12),
    ('country_UY', 'regions', 'R2040', 'Uruguay',                   'country_UY', '#d3cae6', 13),
    ('country_VE', 'regions', 'R2040', 'Venezuela',                 'country_VE', '#c4b9e0', 14);

-- ============================================================================
-- ASIA
-- ============================================================================

-- Asia Sub-regions (Level 1)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('R3010', 'regions', 'R30', 'Western Asia',       'R3010', '#e47da8', 1),
    ('R3020', 'regions', 'R30', 'Central Asia',       'R3020', '#f4a4c2', 2),
    ('R3030', 'regions', 'R30', 'Eastern Asia',       'R3030', '#f9b9cf', 3),
    ('R3040', 'regions', 'R30', 'Southern Asia',      'R3040', '#fccfda', 4),
    ('R3050', 'regions', 'R30', 'South-eastern Asia', 'R3050', '#fee4e5', 5);

-- Western Asia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_AM', 'regions', 'R3010', 'Armenia',                 'country_AM', '#fccfda', 1),
    ('country_AZ', 'regions', 'R3010', 'Azerbaijan',              'country_AZ', '#f9b9cf', 2),
    ('country_BH', 'regions', 'R3010', 'Bahrain',                 'country_BH', '#f4a4c2', 3),
    ('country_CY', 'regions', 'R3010', 'Cyprus',                  'country_CY', '#e47da8', 4),
    ('country_GE', 'regions', 'R3010', 'Georgia',                 'country_GE', '#fccfda', 5),
    ('country_IQ', 'regions', 'R3010', 'Iraq',                    'country_IQ', '#f9b9cf', 6),
    ('country_IL', 'regions', 'R3010', 'Israel',                  'country_IL', '#f4a4c2', 7),
    ('country_JO', 'regions', 'R3010', 'Jordan',                  'country_JO', '#e47da8', 8),
    ('country_KW', 'regions', 'R3010', 'Kuwait',                  'country_KW', '#fccfda', 9),
    ('country_LB', 'regions', 'R3010', 'Lebanon',                 'country_LB', '#f9b9cf', 10),
    ('country_OM', 'regions', 'R3010', 'Oman',                    'country_OM', '#f4a4c2', 11),
    ('country_QA', 'regions', 'R3010', 'Qatar',                   'country_QA', '#e47da8', 12),
    ('country_SA', 'regions', 'R3010', 'Saudi Arabia',            'country_SA', '#fccfda', 13),
    ('country_SY', 'regions', 'R3010', 'Syrian Arab Republic',    'country_SY', '#f9b9cf', 14),
    ('country_TR', 'regions', 'R3010', 'Turkey',                  'country_TR', '#f4a4c2', 15),
    ('country_AE', 'regions', 'R3010', 'United Arab Emirates',    'country_AE', '#e47da8', 16),
    ('country_YE', 'regions', 'R3010', 'Yemen',                   'country_YE', '#fccfda', 17);

-- Central Asia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_KZ', 'regions', 'R3020', 'Kazakhstan',  'country_KZ', '#fccfda', 1),
    ('country_KG', 'regions', 'R3020', 'Kyrgyzstan',  'country_KG', '#f9b9cf', 2),
    ('country_TJ', 'regions', 'R3020', 'Tajikistan',  'country_TJ', '#f4a4c2', 3),
    ('country_TM', 'regions', 'R3020', 'Turkmenistan','country_TM', '#e47da8', 4),
    ('country_UZ', 'regions', 'R3020', 'Uzbekistan',  'country_UZ', '#fccfda', 5);

-- Eastern Asia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_CN', 'regions', 'R3030', 'China',        'country_CN', '#fccfda', 1),
    ('country_HK', 'regions', 'R3030', 'Hong Kong',    'country_HK', '#f9b9cf', 2),
    ('country_JP', 'regions', 'R3030', 'Japan',        'country_JP', '#f4a4c2', 3),
    ('country_MO', 'regions', 'R3030', 'Macao',        'country_MO', '#e47da8', 4),
    ('country_MN', 'regions', 'R3030', 'Mongolia',     'country_MN', '#fccfda', 5),
    ('country_KP', 'regions', 'R3030', 'Korea (North)','country_KP', '#f9b9cf', 6),
    ('country_KR', 'regions', 'R3030', 'Korea (South)','country_KR', '#f4a4c2', 7),
    ('country_TW', 'regions', 'R3030', 'Taiwan',       'country_TW', '#e47da8', 8);

-- Southern Asia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_AF', 'regions', 'R3040', 'Afghanistan',  'country_AF', '#fccfda', 1),
    ('country_BD', 'regions', 'R3040', 'Bangladesh',   'country_BD', '#f9b9cf', 2),
    ('country_BT', 'regions', 'R3040', 'Bhutan',       'country_BT', '#f4a4c2', 3),
    ('country_IN', 'regions', 'R3040', 'India',        'country_IN', '#e47da8', 4),
    ('country_IR', 'regions', 'R3040', 'Iran',         'country_IR', '#fccfda', 5),
    ('country_MV', 'regions', 'R3040', 'Maldives',     'country_MV', '#f9b9cf', 6),
    ('country_NP', 'regions', 'R3040', 'Nepal',        'country_NP', '#f4a4c2', 7),
    ('country_PK', 'regions', 'R3040', 'Pakistan',     'country_PK', '#e47da8', 8),
    ('country_LK', 'regions', 'R3040', 'Sri Lanka',    'country_LK', '#fccfda', 9);

-- South-eastern Asia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_BN', 'regions', 'R3050', 'Brunei Darussalam','country_BN', '#fccfda', 1),
    ('country_KH', 'regions', 'R3050', 'Cambodia',         'country_KH', '#f9b9cf', 2),
    ('country_ID', 'regions', 'R3050', 'Indonesia',        'country_ID', '#f4a4c2', 3),
    ('country_LA', 'regions', 'R3050', 'Lao PDR',          'country_LA', '#e47da8', 4),
    ('country_MY', 'regions', 'R3050', 'Malaysia',         'country_MY', '#fccfda', 5),
    ('country_MM', 'regions', 'R3050', 'Myanmar',          'country_MM', '#f9b9cf', 6),
    ('country_PH', 'regions', 'R3050', 'Philippines',      'country_PH', '#f4a4c2', 7),
    ('country_SG', 'regions', 'R3050', 'Singapore',        'country_SG', '#e47da8', 8),
    ('country_TH', 'regions', 'R3050', 'Thailand',         'country_TH', '#fccfda', 9),
    ('country_TL', 'regions', 'R3050', 'Timor-Leste',      'country_TL', '#f9b9cf', 10),
    ('country_VN', 'regions', 'R3050', 'Viet Nam',         'country_VN', '#f4a4c2', 11);

-- ============================================================================
-- AFRICA
-- ============================================================================

-- Africa Sub-regions (Level 1)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('R4010', 'regions', 'R40', 'Northern Africa', 'R4010', '#5abdac', 1),
    ('R4020', 'regions', 'R40', 'Western Africa',  'R4020', '#87d3c3', 2),
    ('R4030', 'regions', 'R40', 'Eastern Africa',  'R4030', '#a2dece', 3),
    ('R4040', 'regions', 'R40', 'Middle Africa',   'R4040', '#bfe8d9', 4),
    ('R4050', 'regions', 'R40', 'Southern Africa', 'R4050', '#ddf1e4', 5);

-- Northern Africa
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_DZ', 'regions', 'R4010', 'Algeria',        'country_DZ', '#bfe8d9', 1),
    ('country_EG', 'regions', 'R4010', 'Egypt',          'country_EG', '#a2dece', 2),
    ('country_LY', 'regions', 'R4010', 'Libya',          'country_LY', '#87d3c3', 3),
    ('country_MA', 'regions', 'R4010', 'Morocco',        'country_MA', '#5abdac', 4),
    ('country_SD', 'regions', 'R4010', 'Sudan',          'country_SD', '#bfe8d9', 5),
    ('country_TN', 'regions', 'R4010', 'Tunisia',        'country_TN', '#a2dece', 6);

-- Western Africa (corrected GN/GQ)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_BJ', 'regions', 'R4020', 'Benin',              'country_BJ', '#bfe8d9', 1),
    ('country_BF', 'regions', 'R4020', 'Burkina Faso',       'country_BF', '#a2dece', 2),
    ('country_CV', 'regions', 'R4020', 'Cabo Verde',         'country_CV', '#87d3c3', 3),
    ('country_GM', 'regions', 'R4020', 'Gambia',             'country_GM', '#5abdac', 4),
    ('country_GH', 'regions', 'R4020', 'Ghana',              'country_GH', '#bfe8d9', 5),
    ('country_GN', 'regions', 'R4020', 'Guinea',             'country_GN', '#a2dece', 6),
    ('country_GW', 'regions', 'R4020', 'Guinea-Bissau',      'country_GW', '#87d3c3', 7),
    ('country_LR', 'regions', 'R4020', 'Liberia',            'country_LR', '#5abdac', 8),
    ('country_ML', 'regions', 'R4020', 'Mali',               'country_ML', '#bfe8d9', 9),
    ('country_MR', 'regions', 'R4020', 'Mauritania',         'country_MR', '#a2dece', 10),
    ('country_NE', 'regions', 'R4020', 'Niger',              'country_NE', '#87d3c3', 11),
    ('country_NG', 'regions', 'R4020', 'Nigeria',            'country_NG', '#5abdac', 12),
    ('country_SN', 'regions', 'R4020', 'Senegal',            'country_SN', '#bfe8d9', 13),
    ('country_SL', 'regions', 'R4020', 'Sierra Leone',       'country_SL', '#a2dece', 14),
    ('country_SH', 'regions', 'R4020', 'Saint Helena, ATC',  'country_SH', '#87d3c3', 15),
    ('country_TG', 'regions', 'R4020', 'Togo',               'country_TG', '#5abdac', 16);

-- Eastern Africa
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_IO', 'regions', 'R4030', 'British Indian Ocean Territory', 'country_IO', '#bfe8d9', 1),
    ('country_BI', 'regions', 'R4030', 'Burundi',                        'country_BI', '#a2dece', 2),
    ('country_KM', 'regions', 'R4030', 'Comoros',                        'country_KM', '#87d3c3', 3),
    ('country_DJ', 'regions', 'R4030', 'Djibouti',                       'country_DJ', '#5abdac', 4),
    ('country_ER', 'regions', 'R4030', 'Eritrea',                        'country_ER', '#bfe8d9', 5),
    ('country_ET', 'regions', 'R4030', 'Ethiopia',                       'country_ET', '#a2dece', 6),
    ('country_TF', 'regions', 'R4030', 'French Southern Territories',    'country_TF', '#87d3c3', 7),
    ('country_KE', 'regions', 'R4030', 'Kenya',                          'country_KE', '#5abdac', 8),
    ('country_MG', 'regions', 'R4030', 'Madagascar',                     'country_MG', '#bfe8d9', 9),
    ('country_MW', 'regions', 'R4030', 'Malawi',                         'country_MW', '#a2dece', 10),
    ('country_MU', 'regions', 'R4030', 'Mauritius',                      'country_MU', '#87d3c3', 11),
    ('country_YT', 'regions', 'R4030', 'Mayotte',                        'country_YT', '#5abdac', 12),
    ('country_MZ', 'regions', 'R4030', 'Mozambique',                     'country_MZ', '#bfe8d9', 13),
    ('country_RE', 'regions', 'R4030', 'Réunion',                        'country_RE', '#a2dece', 14),
    ('country_RW', 'regions', 'R4030', 'Rwanda',                         'country_RW', '#87d3c3', 15),
    ('country_SC', 'regions', 'R4030', 'Seychelles',                     'country_SC', '#5abdac', 16),
    ('country_SO', 'regions', 'R4030', 'Somalia',                        'country_SO', '#bfe8d9', 17),
    ('country_SS', 'regions', 'R4030', 'South Sudan',                    'country_SS', '#a2dece', 18),
    ('country_TZ', 'regions', 'R4030', 'Tanzania',                       'country_TZ', '#87d3c3', 19),
    ('country_UG', 'regions', 'R4030', 'Uganda',                         'country_UG', '#5abdac', 20),
    ('country_ZM', 'regions', 'R4030', 'Zambia',                         'country_ZM', '#bfe8d9', 21),
    ('country_ZW', 'regions', 'R4030', 'Zimbabwe',                       'country_ZW', '#a2dece', 22);

-- Middle Africa (UN M49 classification)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_AO', 'regions', 'R4040', 'Angola',                          'country_AO', '#bfe8d9', 1),
    ('country_CM', 'regions', 'R4040', 'Cameroon',                        'country_CM', '#a2dece', 2),
    ('country_CF', 'regions', 'R4040', 'Central African Republic',        'country_CF', '#87d3c3', 3),
    ('country_TD', 'regions', 'R4040', 'Chad',                            'country_TD', '#5abdac', 4),
    ('country_CG', 'regions', 'R4040', 'Congo',                           'country_CG', '#bfe8d9', 5),
    ('country_CD', 'regions', 'R4040', 'Congo, Democratic Republic of the','country_CD','#a2dece', 6),
    ('country_GQ', 'regions', 'R4040', 'Equatorial Guinea',               'country_GQ', '#87d3c3', 7),
    ('country_GA', 'regions', 'R4040', 'Gabon',                           'country_GA', '#5abdac', 8),
    ('country_ST', 'regions', 'R4040', 'São Tomé and Príncipe',           'country_ST', '#bfe8d9', 9);

-- Southern Africa
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_BW', 'regions', 'R4050', 'Botswana',     'country_BW', '#bfe8d9', 1),
    ('country_LS', 'regions', 'R4050', 'Lesotho',      'country_LS', '#a2dece', 2),
    ('country_NA', 'regions', 'R4050', 'Namibia',      'country_NA', '#87d3c3', 3),
    ('country_ZA', 'regions', 'R4050', 'South Africa', 'country_ZA', '#5abdac', 4),
    ('country_SZ', 'regions', 'R4050', 'Eswatini',     'country_SZ', '#bfe8d9', 5);

-- ============================================================================
-- OCEANIA
-- ============================================================================

-- Oceania Sub-regions (Level 1)
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('R5010', 'regions', 'R50', 'Australia and New Zealand', 'R5010', '#a0af54', 1),
    ('R5020', 'regions', 'R50', 'Melanesia',                'R5020', '#bec97e', 2),
    ('R5030', 'regions', 'R50', 'Micronesia',               'R5030', '#cdd597', 3),
    ('R5040', 'regions', 'R50', 'Polynesia',                'R5040', '#dde2b2', 4);

-- Australia and New Zealand
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_AU', 'regions', 'R5010', 'Australia',     'country_AU', '#cdd597', 1),
    ('country_NZ', 'regions', 'R5010', 'New Zealand',   'country_NZ', '#bec97e', 2),
    ('country_NF', 'regions', 'R5010', 'Norfolk Island','country_NF', '#a0af54', 3);

-- Melanesia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_FJ', 'regions', 'R5020', 'Fiji',             'country_FJ', '#cdd597', 1),
    ('country_NC', 'regions', 'R5020', 'New Caledonia',    'country_NC', '#bec97e', 2),
    ('country_PG', 'regions', 'R5020', 'Papua New Guinea', 'country_PG', '#a0af54', 3),
    ('country_VU', 'regions', 'R5020', 'Vanuatu',          'country_VU', '#cdd597', 4);

-- Micronesia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_GU', 'regions', 'R5030', 'Guam',                               'country_GU', '#cdd597', 1),
    ('country_KI', 'regions', 'R5030', 'Kiribati',                           'country_KI', '#bec97e', 2),
    ('country_MH', 'regions', 'R5030', 'Marshall Islands',                   'country_MH', '#a0af54', 3),
    ('country_FM', 'regions', 'R5030', 'Micronesia (Federated States of)',   'country_FM', '#cdd597', 4),
    ('country_NR', 'regions', 'R5030', 'Nauru',                              'country_NR', '#bec97e', 5),
    ('country_MP', 'regions', 'R5030', 'Northern Mariana Islands',           'country_MP', '#a0af54', 6),
    ('country_PW', 'regions', 'R5030', 'Palau',                              'country_PW', '#cdd597', 7);

-- Polynesia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order) VALUES
    ('country_AS', 'regions', 'R5040', 'American Samoa',    'country_AS', '#cdd597', 1),
    ('country_CK', 'regions', 'R5040', 'Cook Islands',      'country_CK', '#bec97e', 2),
    ('country_PF', 'regions', 'R5040', 'French Polynesia',  'country_PF', '#a0af54', 3),
    ('country_NU', 'regions', 'R5040', 'Niue',              'country_NU', '#cdd597', 4),
    ('country_PN', 'regions', 'R5040', 'Pitcairn',          'country_PN', '#bec97e', 5),
    ('country_WS', 'regions', 'R5040', 'Samoa',             'country_WS', '#a0af54', 6),
    ('country_TK', 'regions', 'R5040', 'Tokelau',           'country_TK', '#cdd597', 7),
    ('country_TO', 'regions', 'R5040', 'Tonga',             'country_TO', '#bec97e', 8),
    ('country_TV', 'regions', 'R5040', 'Tuvalu',            'country_TV', '#a0af54', 9),
    ('country_WF', 'regions', 'R5040', 'Wallis and Futuna', 'country_WF', '#cdd597', 10);

-- ============================================================================
-- AUTO-MIGRATE: asset_class -> asset_classes TAXONOMY
-- Reads from metadata.legacy.asset_class (set by core_schema_redesign)
-- Uses UPPER() for case-insensitive matching
-- ============================================================================

INSERT INTO asset_taxonomy_assignments (id, asset_id, taxonomy_id, category_id, weight, source)
SELECT
    lower(hex(randomblob(16))),
    a.id,
    'asset_classes',
    CASE
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) = 'EQUITY' THEN 'EQUITY'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) = 'CASH' THEN 'CASH'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) = 'COMMODITY' THEN 'COMMODITIES'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%REAL ESTATE%' THEN 'REAL_ESTATE'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%BOND%'
          OR UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%DEBT%'
          OR UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%FIXED%' THEN 'FIXED_INCOME'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%CRYPTO%'
          OR UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%DIGITAL%' THEN 'DIGITAL_ASSETS'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%ALTERNATIVE%' THEN 'ALTERNATIVES'
        ELSE NULL
    END,
    10000,
    'migrated'
FROM assets a
WHERE json_extract(a.metadata, '$.legacy.asset_class') IS NOT NULL
  AND CASE
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) = 'EQUITY' THEN 'EQUITY'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) = 'CASH' THEN 'CASH'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) = 'COMMODITY' THEN 'COMMODITIES'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%REAL ESTATE%' THEN 'REAL_ESTATE'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%BOND%'
          OR UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%DEBT%'
          OR UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%FIXED%' THEN 'FIXED_INCOME'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%CRYPTO%'
          OR UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%DIGITAL%' THEN 'DIGITAL_ASSETS'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_class')) LIKE '%ALTERNATIVE%' THEN 'ALTERNATIVES'
        ELSE NULL
      END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'asset_classes'
  );

-- ============================================================================
-- AUTO-MIGRATE: asset_sub_class -> instrument_type TAXONOMY
-- Reads from metadata.legacy.asset_sub_class (set by core_schema_redesign)
-- Maps old flat categories to new hierarchical children
-- Uses UPPER() for case-insensitive matching
-- ============================================================================

INSERT INTO asset_taxonomy_assignments (id, asset_id, taxonomy_id, category_id, weight, source)
SELECT
    lower(hex(randomblob(16))),
    a.id,
    'instrument_type',
    CASE
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) = 'STOCK' THEN 'STOCK_COMMON'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) = 'ETF' THEN 'ETF'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) IN ('MUTUAL FUND', 'MUTUALFUND') THEN 'FUND_MUTUAL'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) IN ('CRYPTOCURRENCY', 'CRYPTO') THEN 'CRYPTO_NATIVE'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) = 'CASH' THEN 'CASH'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) LIKE '%BOND%' THEN 'BOND_CORPORATE'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) = 'OPTION' THEN 'OPTION'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) IN ('FUTURE', 'FUTURES') THEN 'FUTURE'
        ELSE NULL
    END,
    10000,
    'migrated'
FROM assets a
WHERE json_extract(a.metadata, '$.legacy.asset_sub_class') IS NOT NULL
  AND CASE
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) = 'STOCK' THEN 'STOCK_COMMON'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) = 'ETF' THEN 'ETF'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) IN ('MUTUAL FUND', 'MUTUALFUND') THEN 'FUND_MUTUAL'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) IN ('CRYPTOCURRENCY', 'CRYPTO') THEN 'CRYPTO_NATIVE'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) = 'CASH' THEN 'CASH'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) LIKE '%BOND%' THEN 'BOND_CORPORATE'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) = 'OPTION' THEN 'OPTION'
        WHEN UPPER(json_extract(a.metadata, '$.legacy.asset_sub_class')) IN ('FUTURE', 'FUTURES') THEN 'FUTURE'
        ELSE NULL
      END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'instrument_type'
  );

-- ============================================================================
-- NOTE: Legacy metadata cleanup is handled by the Rust migrate_legacy_classifications
-- function after manual migration completes via the UI banner.
-- The $.legacy structure is preserved here so the migration banner can detect
-- assets with sectors/countries data that need manual migration.
-- ============================================================================
