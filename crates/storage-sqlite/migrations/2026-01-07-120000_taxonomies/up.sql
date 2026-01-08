-- Taxonomies Migration
-- Creates tables for user-configurable asset classification taxonomies
-- Supports hierarchical categories with colors for visualization

-- ============================================================================
-- TAXONOMIES TABLE
-- Stores taxonomy definitions (e.g., "Asset Classes", "Industries (GICS)")
-- ============================================================================

CREATE TABLE taxonomies (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#8abceb',
    description TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    is_single_select INTEGER NOT NULL DEFAULT 0,  -- 1 = only one category per asset allowed
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ix_taxonomies_sort_order ON taxonomies(sort_order);

-- ============================================================================
-- TAXONOMY_CATEGORIES TABLE
-- Stores categories within a taxonomy (recursive hierarchy via parent_id)
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
-- Maps assets to taxonomy categories with optional weight (for multi-category)
-- ============================================================================

CREATE TABLE asset_taxonomy_assignments (
    id TEXT NOT NULL PRIMARY KEY,
    asset_id TEXT NOT NULL,
    taxonomy_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 10000,  -- basis points: 10000 = 100%
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
  (
    'type_of_security',
    'Type of Security',
    '#4385be',
    'Instrument structure used for filtering/reporting (e.g., Stock, ETF, Bond, Option). Should not drive calculation logic.',
    1, 1, 10
  ),
  (
    'risk_category',
    'Risk Category',
    '#d14d41',
    'Risk level classification for assets. Single-select: each asset can only have one risk category assigned.',
    1, 1, 15
  ),
  (
    'asset_classes',
    'Asset Classes',
    '#879a39',
    'High-level asset class rollup (e.g., Equity, Debt, Cash, Real Estate, Commodity) for summaries and charts.',
    1, 0, 20
  ),
  (
    'industries_gics',
    'Industries (GICS)',
    '#da702c',
    'Global Industry Classification Standard (GICS) hierarchy: Sector → Industry Group → Industry → Sub-Industry. Best applied to equities or look-through exposures for funds/ETFs.',
    1, 0, 30
  ),
  (
    'regions',
    'Regions',
    '#8b7ec8',
    'Geographic exposure grouping for reporting (e.g., North America, Europe, Emerging Markets). Define what "region" means (domicile vs revenue exposure) and apply consistently.',
    1, 0, 40
  ),
  (
    'custom_groups',
    'Custom Groups',
    '#878580',
    'User-defined tags for grouping assets. Use for watchlists, themes, strategies, or any personal organization. Multi-select: assets can belong to multiple groups.',
    1, 0, 100
  );

-- ============================================================================
-- SEED DATA: TYPE OF SECURITY CATEGORIES
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('STOCK',  'type_of_security', NULL, 'Stock',                      'STOCK',  '#4385be', 1),  -- blue-400
  ('FUND',   'type_of_security', NULL, 'Fund',                       'FUND',   '#3aa99f', 2),  -- cyan-400
  ('ETF',    'type_of_security', NULL, 'Exchange Traded Fund (ETF)', 'ETF',    '#8b7ec8', 3),  -- purple-400
  ('BOND',   'type_of_security', NULL, 'Bond',                       'BOND',   '#879a39', 4),  -- green-400
  ('OPTION', 'type_of_security', NULL, 'Option',                     'OPTION', '#da702c', 5),  -- orange-400
  ('CASH',   'type_of_security', NULL, 'Cash',                       'CASH',   '#d0a215', 6),  -- yellow-400
  ('CRYPTO', 'type_of_security', NULL, 'Cryptocurrency',             'CRYPTO', '#ce5d97', 7);  -- magenta-400

-- ============================================================================
-- SEED DATA: RISK CATEGORY (single-select)
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('UNKNOWN', 'risk_category', NULL, 'Unknown',  'UNKNOWN', '#878580', 1),  -- base-500 (gray)
  ('LOW',     'risk_category', NULL, 'Low',      'LOW',     '#879a39', 2),  -- green-400
  ('MEDIUM',  'risk_category', NULL, 'Medium',   'MEDIUM',  '#d0a215', 3),  -- yellow-400
  ('HIGH',    'risk_category', NULL, 'High',     'HIGH',    '#d14d41', 4);  -- red-400

-- ============================================================================
-- SEED DATA: ASSET CLASSES CATEGORIES
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('CASH', 'asset_classes', NULL, 'Cash', 'CASH', '#c437c2', 1),
  ('EQUITY', 'asset_classes', NULL, 'Equity', 'EQUITY', '#5757ff', 2),
  ('DEBT', 'asset_classes', NULL, 'Debt', 'DEBT', '#dca122', 3),
  ('REAL_ESTATE', 'asset_classes', NULL, 'Real Estate', 'REAL_ESTATE', '#fd6a0e', 4),
  ('COMMODITY', 'asset_classes', NULL, 'Commodity', 'COMMODITY', '#579f57', 5);

-- ============================================================================
-- SEED DATA: CUSTOM GROUPS (user-defined, starts empty)
-- No default categories - users create their own groups
-- ============================================================================

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) CATEGORIES
-- Hierarchy: Sector (2-digit) → Industry Group (4-digit) → Industry (6-digit) → Sub-Industry (8-digit)
-- ============================================================================

-- Energy Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('10', 'industries_gics', NULL, 'Energy', '10', '#8a892c', 1),
  ('1010', 'industries_gics', '10', 'Energy', '1010', '#a3a345', 1),
  ('101010', 'industries_gics', '1010', 'Energy Equipment & Services', '101010', '#bdbc62', 1),
  ('10101010', 'industries_gics', '101010', 'Oil & Gas Drilling', '10101010', '#d6d685', 1),
  ('10101020', 'industries_gics', '101010', 'Oil & Gas Equipment & Services', '10101020', '#d6d685', 2),
  ('101020', 'industries_gics', '1010', 'Oil, Gas & Consumable Fuels', '101020', '#bdbc62', 2),
  ('10102010', 'industries_gics', '101020', 'Integrated Oil & Gas', '10102010', '#d6d685', 1),
  ('10102020', 'industries_gics', '101020', 'Oil & Gas Exploration & Production', '10102020', '#d6d685', 2),
  ('10102030', 'industries_gics', '101020', 'Oil & Gas Refining & Marketing', '10102030', '#d6d685', 3),
  ('10102040', 'industries_gics', '101020', 'Oil & Gas Storage & Transportation', '10102040', '#d6d685', 4),
  ('10102050', 'industries_gics', '101020', 'Coal & Consumable Fuels', '10102050', '#d6d685', 5);

-- Materials Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('15', 'industries_gics', NULL, 'Materials', '15', '#578a2c', 2),
  ('1510', 'industries_gics', '15', 'Materials', '1510', '#70a345', 1),
  ('151010', 'industries_gics', '1510', 'Chemicals', '151010', '#8cbd62', 1),
  ('15101010', 'industries_gics', '151010', 'Commodity Chemicals', '15101010', '#aad685', 1),
  ('15101020', 'industries_gics', '151010', 'Diversified Chemicals', '15101020', '#aad685', 2),
  ('15101030', 'industries_gics', '151010', 'Fertilizers & Agricultural Chemicals', '15101030', '#aad685', 3),
  ('15101040', 'industries_gics', '151010', 'Industrial Gases', '15101040', '#aad685', 4),
  ('15101050', 'industries_gics', '151010', 'Specialty Chemicals', '15101050', '#aad685', 5),
  ('151020', 'industries_gics', '1510', 'Construction Materials', '151020', '#8cbd62', 2),
  ('15102010', 'industries_gics', '151020', 'Construction Materials', '15102010', '#aad685', 1),
  ('151030', 'industries_gics', '1510', 'Containers & Packaging', '151030', '#8cbd62', 3),
  ('15103010', 'industries_gics', '151030', 'Metal & Glass Containers', '15103010', '#aad685', 1),
  ('15103020', 'industries_gics', '151030', 'Paper Packaging', '15103020', '#aad685', 2),
  ('151040', 'industries_gics', '1510', 'Metals & Mining', '151040', '#8cbd62', 4),
  ('15104010', 'industries_gics', '151040', 'Aluminum', '15104010', '#aad685', 1),
  ('15104020', 'industries_gics', '151040', 'Diversified Metals & Mining', '15104020', '#aad685', 2),
  ('15104025', 'industries_gics', '151040', 'Copper', '15104025', '#aad685', 3),
  ('15104030', 'industries_gics', '151040', 'Gold', '15104030', '#aad685', 4),
  ('15104040', 'industries_gics', '151040', 'Precious Metals & Minerals', '15104040', '#aad685', 5),
  ('15104045', 'industries_gics', '151040', 'Silver', '15104045', '#aad685', 6),
  ('15104050', 'industries_gics', '151040', 'Steel', '15104050', '#aad685', 7),
  ('151050', 'industries_gics', '1510', 'Paper & Forest Products', '151050', '#8cbd62', 5),
  ('15105010', 'industries_gics', '151050', 'Forest Products', '15105010', '#aad685', 1),
  ('15105020', 'industries_gics', '151050', 'Paper Products', '15105020', '#aad685', 2);

-- Industrials Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('20', 'industries_gics', NULL, 'Industrials', '20', '#2c8a34', 3),
  ('2010', 'industries_gics', '20', 'Capital Goods', '2010', '#45a34d', 1),
  ('201010', 'industries_gics', '2010', 'Aerospace & Defense', '201010', '#62bd6a', 1),
  ('20101010', 'industries_gics', '201010', 'Aerospace & Defense', '20101010', '#85d68c', 1),
  ('201020', 'industries_gics', '2010', 'Building Products', '201020', '#62bd6a', 2),
  ('20102010', 'industries_gics', '201020', 'Building Products', '20102010', '#85d68c', 1),
  ('201030', 'industries_gics', '2010', 'Construction & Engineering', '201030', '#62bd6a', 3),
  ('20103010', 'industries_gics', '201030', 'Construction & Engineering', '20103010', '#85d68c', 1),
  ('201040', 'industries_gics', '2010', 'Electrical Equipment', '201040', '#62bd6a', 4),
  ('20104010', 'industries_gics', '201040', 'Electrical Components & Equipment', '20104010', '#85d68c', 1),
  ('20104020', 'industries_gics', '201040', 'Heavy Electrical Equipment', '20104020', '#85d68c', 2),
  ('201050', 'industries_gics', '2010', 'Industrial Conglomerates', '201050', '#62bd6a', 5),
  ('20105010', 'industries_gics', '201050', 'Industrial Conglomerates', '20105010', '#85d68c', 1),
  ('201060', 'industries_gics', '2010', 'Machinery', '201060', '#62bd6a', 6),
  ('20106010', 'industries_gics', '201060', 'Construction Machinery & Heavy Trucks', '20106010', '#85d68c', 1),
  ('20106015', 'industries_gics', '201060', 'Agricultural & Farm Machinery', '20106015', '#85d68c', 2),
  ('20106020', 'industries_gics', '201060', 'Industrial Machinery', '20106020', '#85d68c', 3),
  ('201070', 'industries_gics', '2010', 'Trading Companies & Distributors', '201070', '#62bd6a', 7),
  ('20107010', 'industries_gics', '201070', 'Trading Companies & Distributors', '20107010', '#85d68c', 1),
  ('2020', 'industries_gics', '20', 'Commercial & Professional Services', '2020', '#45a34d', 2),
  ('202010', 'industries_gics', '2020', 'Commercial Services & Supplies', '202010', '#62bd6a', 1),
  ('20201010', 'industries_gics', '202010', 'Commercial Printing', '20201010', '#85d68c', 1),
  ('20201050', 'industries_gics', '202010', 'Environmental & Facilities Services', '20201050', '#85d68c', 2),
  ('20201060', 'industries_gics', '202010', 'Office Services & Supplies', '20201060', '#85d68c', 3),
  ('20201070', 'industries_gics', '202010', 'Diversified Support Services', '20201070', '#85d68c', 4),
  ('20201080', 'industries_gics', '202010', 'Security & Alarm Services', '20201080', '#85d68c', 5),
  ('202020', 'industries_gics', '2020', 'Professional Services', '202020', '#62bd6a', 2),
  ('20202010', 'industries_gics', '202020', 'Human Resource & Employment Services', '20202010', '#85d68c', 1),
  ('20202020', 'industries_gics', '202020', 'Research & Consulting Services', '20202020', '#85d68c', 2),
  ('2030', 'industries_gics', '20', 'Transportation', '2030', '#45a34d', 3),
  ('203010', 'industries_gics', '2030', 'Air Freight & Logistics', '203010', '#62bd6a', 1),
  ('20301010', 'industries_gics', '203010', 'Air Freight & Logistics', '20301010', '#85d68c', 1),
  ('203020', 'industries_gics', '2030', 'Airlines', '203020', '#62bd6a', 2),
  ('20302010', 'industries_gics', '203020', 'Airlines', '20302010', '#85d68c', 1),
  ('203030', 'industries_gics', '2030', 'Marine', '203030', '#62bd6a', 3),
  ('20303010', 'industries_gics', '203030', 'Marine', '20303010', '#85d68c', 1),
  ('203040', 'industries_gics', '2030', 'Road & Rail', '203040', '#62bd6a', 4),
  ('20304010', 'industries_gics', '203040', 'Railroads', '20304010', '#85d68c', 1),
  ('20304020', 'industries_gics', '203040', 'Trucking', '20304020', '#85d68c', 2),
  ('203050', 'industries_gics', '2030', 'Transportation Infrastructure', '203050', '#62bd6a', 5),
  ('20305010', 'industries_gics', '203050', 'Airport Services', '20305010', '#85d68c', 1),
  ('20305020', 'industries_gics', '203050', 'Highways & Railtracks', '20305020', '#85d68c', 2),
  ('20305030', 'industries_gics', '203050', 'Marine Ports & Services', '20305030', '#85d68c', 3);

-- Consumer Discretionary Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('25', 'industries_gics', NULL, 'Consumer Discretionary', '25', '#2c8a67', 4),
  ('2510', 'industries_gics', '25', 'Automobiles & Components', '2510', '#45a380', 1),
  ('251010', 'industries_gics', '2510', 'Auto Components', '251010', '#62bd9b', 1),
  ('25101010', 'industries_gics', '251010', 'Auto Parts & Equipment', '25101010', '#85d6b8', 1),
  ('25101020', 'industries_gics', '251010', 'Tires & Rubber', '25101020', '#85d6b8', 2),
  ('251020', 'industries_gics', '2510', 'Automobiles', '251020', '#62bd9b', 2),
  ('25102010', 'industries_gics', '251020', 'Automobile Manufacturers', '25102010', '#85d6b8', 1),
  ('25102020', 'industries_gics', '251020', 'Motorcycle Manufacturers', '25102020', '#85d6b8', 2),
  ('2520', 'industries_gics', '25', 'Consumer Durables & Apparel', '2520', '#45a380', 2),
  ('252010', 'industries_gics', '2520', 'Household Durables', '252010', '#62bd9b', 1),
  ('25201010', 'industries_gics', '252010', 'Consumer Electronics', '25201010', '#85d6b8', 1),
  ('25201020', 'industries_gics', '252010', 'Home Furnishings', '25201020', '#85d6b8', 2),
  ('25201030', 'industries_gics', '252010', 'Homebuilding', '25201030', '#85d6b8', 3),
  ('25201040', 'industries_gics', '252010', 'Household Appliances', '25201040', '#85d6b8', 4),
  ('25201050', 'industries_gics', '252010', 'Housewares & Specialties', '25201050', '#85d6b8', 5),
  ('252020', 'industries_gics', '2520', 'Leisure Products', '252020', '#62bd9b', 2),
  ('25202010', 'industries_gics', '252020', 'Leisure Products', '25202010', '#85d6b8', 1),
  ('252030', 'industries_gics', '2520', 'Textiles, Apparel & Luxury Goods', '252030', '#62bd9b', 3),
  ('25203010', 'industries_gics', '252030', 'Apparel, Accessories & Luxury Goods', '25203010', '#85d6b8', 1),
  ('25203020', 'industries_gics', '252030', 'Footwear', '25203020', '#85d6b8', 2),
  ('25203030', 'industries_gics', '252030', 'Textiles', '25203030', '#85d6b8', 3),
  ('2530', 'industries_gics', '25', 'Consumer Services', '2530', '#45a380', 3),
  ('253010', 'industries_gics', '2530', 'Hotels, Restaurants & Leisure', '253010', '#62bd9b', 1),
  ('25301010', 'industries_gics', '253010', 'Casinos & Gaming', '25301010', '#85d6b8', 1),
  ('25301020', 'industries_gics', '253010', 'Hotels, Resorts & Cruise Lines', '25301020', '#85d6b8', 2),
  ('25301030', 'industries_gics', '253010', 'Leisure Facilities', '25301030', '#85d6b8', 3),
  ('25301040', 'industries_gics', '253010', 'Restaurants', '25301040', '#85d6b8', 4),
  ('253020', 'industries_gics', '2530', 'Diversified Consumer Services', '253020', '#62bd9b', 2),
  ('25302010', 'industries_gics', '253020', 'Education Services', '25302010', '#85d6b8', 1),
  ('25302020', 'industries_gics', '253020', 'Specialized Consumer Services', '25302020', '#85d6b8', 2),
  ('2550', 'industries_gics', '25', 'Retailing', '2550', '#45a380', 4),
  ('255010', 'industries_gics', '2550', 'Distributors', '255010', '#62bd9b', 1),
  ('25501010', 'industries_gics', '255010', 'Distributors', '25501010', '#85d6b8', 1),
  ('255020', 'industries_gics', '2550', 'Internet & Direct Marketing Retail', '255020', '#62bd9b', 2),
  ('25502020', 'industries_gics', '255020', 'Internet & Direct Marketing Retail', '25502020', '#85d6b8', 1),
  ('255030', 'industries_gics', '2550', 'Multiline Retail', '255030', '#62bd9b', 3),
  ('25503010', 'industries_gics', '255030', 'Department Stores', '25503010', '#85d6b8', 1),
  ('25503020', 'industries_gics', '255030', 'General Merchandise Stores', '25503020', '#85d6b8', 2),
  ('255040', 'industries_gics', '2550', 'Specialty Retail', '255040', '#62bd9b', 4),
  ('25504010', 'industries_gics', '255040', 'Apparel Retail', '25504010', '#85d6b8', 1),
  ('25504020', 'industries_gics', '255040', 'Computer & Electronics Retail', '25504020', '#85d6b8', 2),
  ('25504030', 'industries_gics', '255040', 'Home Improvement Retail', '25504030', '#85d6b8', 3),
  ('25504040', 'industries_gics', '255040', 'Specialty Stores', '25504040', '#85d6b8', 4),
  ('25504050', 'industries_gics', '255040', 'Automotive Retail', '25504050', '#85d6b8', 5),
  ('25504060', 'industries_gics', '255040', 'Homefurnishing Retail', '25504060', '#85d6b8', 6);

-- Consumer Staples Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('30', 'industries_gics', NULL, 'Consumer Staples', '30', '#2c798a', 5),
  ('3010', 'industries_gics', '30', 'Food & Staples Retailing', '3010', '#4592a3', 1),
  ('301010', 'industries_gics', '3010', 'Food & Staples Retailing', '301010', '#62adbd', 1),
  ('30101010', 'industries_gics', '301010', 'Drug Retail', '30101010', '#85c8d6', 1),
  ('30101020', 'industries_gics', '301010', 'Food Distributors', '30101020', '#85c8d6', 2),
  ('30101030', 'industries_gics', '301010', 'Food Retail', '30101030', '#85c8d6', 3),
  ('30101040', 'industries_gics', '301010', 'Hypermarkets & Super Centers', '30101040', '#85c8d6', 4),
  ('3020', 'industries_gics', '30', 'Food, Beverage & Tobacco', '3020', '#4592a3', 2),
  ('302010', 'industries_gics', '3020', 'Beverages', '302010', '#62adbd', 1),
  ('30201010', 'industries_gics', '302010', 'Brewers', '30201010', '#85c8d6', 1),
  ('30201020', 'industries_gics', '302010', 'Distillers & Vintners', '30201020', '#85c8d6', 2),
  ('30201030', 'industries_gics', '302010', 'Soft Drinks', '30201030', '#85c8d6', 3),
  ('302020', 'industries_gics', '3020', 'Food Products', '302020', '#62adbd', 2),
  ('30202010', 'industries_gics', '302020', 'Agricultural Products', '30202010', '#85c8d6', 1),
  ('30202030', 'industries_gics', '302020', 'Packaged Foods & Meats', '30202030', '#85c8d6', 2),
  ('302030', 'industries_gics', '3020', 'Tobacco', '302030', '#62adbd', 3),
  ('30203010', 'industries_gics', '302030', 'Tobacco', '30203010', '#85c8d6', 1),
  ('3030', 'industries_gics', '30', 'Household & Personal Products', '3030', '#4592a3', 3),
  ('303010', 'industries_gics', '3030', 'Household Products', '303010', '#62adbd', 1),
  ('30301010', 'industries_gics', '303010', 'Household Products', '30301010', '#85c8d6', 1),
  ('303020', 'industries_gics', '3030', 'Personal Products', '303020', '#62adbd', 2),
  ('30302010', 'industries_gics', '303020', 'Personal Products', '30302010', '#85c8d6', 1);

-- Health Care Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('35', 'industries_gics', NULL, 'Health Care', '35', '#2c468a', 6),
  ('3510', 'industries_gics', '35', 'Health Care Equipment & Services', '3510', '#455fa3', 1),
  ('351010', 'industries_gics', '3510', 'Health Care Equipment & Supplies', '351010', '#627bbd', 1),
  ('35101010', 'industries_gics', '351010', 'Health Care Equipment', '35101010', '#859cd6', 1),
  ('35101020', 'industries_gics', '351010', 'Health Care Supplies', '35101020', '#859cd6', 2),
  ('351020', 'industries_gics', '3510', 'Health Care Providers & Services', '351020', '#627bbd', 2),
  ('35102010', 'industries_gics', '351020', 'Health Care Distributors', '35102010', '#859cd6', 1),
  ('35102015', 'industries_gics', '351020', 'Health Care Services', '35102015', '#859cd6', 2),
  ('35102020', 'industries_gics', '351020', 'Health Care Facilities', '35102020', '#859cd6', 3),
  ('35102030', 'industries_gics', '351020', 'Managed Health Care', '35102030', '#859cd6', 4),
  ('351030', 'industries_gics', '3510', 'Health Care Technology', '351030', '#627bbd', 3),
  ('35103010', 'industries_gics', '351030', 'Health Care Technology', '35103010', '#859cd6', 1),
  ('3520', 'industries_gics', '35', 'Pharmaceuticals, Biotechnology & Life Sciences', '3520', '#455fa3', 2),
  ('352010', 'industries_gics', '3520', 'Biotechnology', '352010', '#627bbd', 1),
  ('35201010', 'industries_gics', '352010', 'Biotechnology', '35201010', '#859cd6', 1),
  ('352020', 'industries_gics', '3520', 'Pharmaceuticals', '352020', '#627bbd', 2),
  ('35202010', 'industries_gics', '352020', 'Pharmaceuticals', '35202010', '#859cd6', 1),
  ('352030', 'industries_gics', '3520', 'Life Sciences Tools & Services', '352030', '#627bbd', 3),
  ('35203010', 'industries_gics', '352030', 'Life Sciences Tools & Services', '35203010', '#859cd6', 1);

-- Financials Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('40', 'industries_gics', NULL, 'Financials', '40', '#452c8a', 7),
  ('4010', 'industries_gics', '40', 'Banks', '4010', '#5e45a3', 1),
  ('401010', 'industries_gics', '4010', 'Banks', '401010', '#7b62bd', 1),
  ('40101010', 'industries_gics', '401010', 'Diversified Banks', '40101010', '#9b85d6', 1),
  ('40101015', 'industries_gics', '401010', 'Regional Banks', '40101015', '#9b85d6', 2),
  ('401020', 'industries_gics', '4010', 'Thrifts & Mortgage Finance', '401020', '#7b62bd', 2),
  ('40102010', 'industries_gics', '401020', 'Thrifts & Mortgage Finance', '40102010', '#9b85d6', 1),
  ('4020', 'industries_gics', '40', 'Diversified Financials', '4020', '#5e45a3', 2),
  ('402010', 'industries_gics', '4020', 'Diversified Financial Services', '402010', '#7b62bd', 1),
  ('40201020', 'industries_gics', '402010', 'Other Diversified Financial Services', '40201020', '#9b85d6', 1),
  ('40201030', 'industries_gics', '402010', 'Multi-Sector Holdings', '40201030', '#9b85d6', 2),
  ('40201040', 'industries_gics', '402010', 'Specialized Finance', '40201040', '#9b85d6', 3),
  ('402020', 'industries_gics', '4020', 'Consumer Finance', '402020', '#7b62bd', 2),
  ('40202010', 'industries_gics', '402020', 'Consumer Finance', '40202010', '#9b85d6', 1),
  ('402030', 'industries_gics', '4020', 'Capital Markets', '402030', '#7b62bd', 3),
  ('40203010', 'industries_gics', '402030', 'Asset Management & Custody Banks', '40203010', '#9b85d6', 1),
  ('40203020', 'industries_gics', '402030', 'Investment Banking & Brokerage', '40203020', '#9b85d6', 2),
  ('40203030', 'industries_gics', '402030', 'Diversified Capital Markets', '40203030', '#9b85d6', 3),
  ('40203040', 'industries_gics', '402030', 'Financial Exchanges & Data', '40203040', '#9b85d6', 4),
  ('402040', 'industries_gics', '4020', 'Mortgage Real Estate Investment Trusts (REITs)', '402040', '#7b62bd', 4),
  ('40204010', 'industries_gics', '402040', 'Mortgage REITs', '40204010', '#9b85d6', 1),
  ('4030', 'industries_gics', '40', 'Insurance', '4030', '#5e45a3', 3),
  ('403010', 'industries_gics', '4030', 'Insurance', '403010', '#7b62bd', 1),
  ('40301010', 'industries_gics', '403010', 'Insurance Brokers', '40301010', '#9b85d6', 1),
  ('40301020', 'industries_gics', '403010', 'Life & Health Insurance', '40301020', '#9b85d6', 2),
  ('40301030', 'industries_gics', '403010', 'Multi-line Insurance', '40301030', '#9b85d6', 3),
  ('40301040', 'industries_gics', '403010', 'Property & Casualty Insurance', '40301040', '#9b85d6', 4),
  ('40301050', 'industries_gics', '403010', 'Reinsurance', '40301050', '#9b85d6', 5);

-- Information Technology Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('45', 'industries_gics', NULL, 'Information Technology', '45', '#782c8a', 8),
  ('4510', 'industries_gics', '45', 'Software & Services', '4510', '#9145a3', 1),
  ('451020', 'industries_gics', '4510', 'IT Services', '451020', '#ac62bd', 1),
  ('45102010', 'industries_gics', '451020', 'IT Consulting & Other Services', '45102010', '#c785d6', 1),
  ('45102020', 'industries_gics', '451020', 'Data Processing & Outsourced Services', '45102020', '#c785d6', 2),
  ('45102030', 'industries_gics', '451020', 'Internet Services & Infrastructure', '45102030', '#c785d6', 3),
  ('451030', 'industries_gics', '4510', 'Software', '451030', '#ac62bd', 2),
  ('45103010', 'industries_gics', '451030', 'Application Software', '45103010', '#c785d6', 1),
  ('45103020', 'industries_gics', '451030', 'Systems Software', '45103020', '#c785d6', 2),
  ('4520', 'industries_gics', '45', 'Technology Hardware & Equipment', '4520', '#9145a3', 2),
  ('452010', 'industries_gics', '4520', 'Communications Equipment', '452010', '#ac62bd', 1),
  ('45201020', 'industries_gics', '452010', 'Communications Equipment', '45201020', '#c785d6', 1),
  ('452020', 'industries_gics', '4520', 'Technology Hardware, Storage & Peripherals', '452020', '#ac62bd', 2),
  ('45202030', 'industries_gics', '452020', 'Technology Hardware, Storage & Peripherals', '45202030', '#c785d6', 1),
  ('452030', 'industries_gics', '4520', 'Electronic Equipment, Instruments & Components', '452030', '#ac62bd', 3),
  ('45203010', 'industries_gics', '452030', 'Electronic Equipment & Instruments', '45203010', '#c785d6', 1),
  ('45203015', 'industries_gics', '452030', 'Electronic Components', '45203015', '#c785d6', 2),
  ('45203020', 'industries_gics', '452030', 'Electronic Manufacturing Services', '45203020', '#c785d6', 3),
  ('45203030', 'industries_gics', '452030', 'Technology Distributors', '45203030', '#c785d6', 4),
  ('4530', 'industries_gics', '45', 'Semiconductors & Semiconductor Equipment', '4530', '#9145a3', 3),
  ('453010', 'industries_gics', '4530', 'Semiconductors & Semiconductor Equipment', '453010', '#ac62bd', 1),
  ('45301010', 'industries_gics', '453010', 'Semiconductor Equipment', '45301010', '#c785d6', 1),
  ('45301020', 'industries_gics', '453010', 'Semiconductors', '45301020', '#c785d6', 2);

-- Communication Services Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('50', 'industries_gics', NULL, 'Communication Services', '50', '#8a2c68', 9),
  ('5010', 'industries_gics', '50', 'Telecommunication Services', '5010', '#a34581', 1),
  ('501010', 'industries_gics', '5010', 'Diversified Telecommunication Services', '501010', '#bd629c', 1),
  ('50101010', 'industries_gics', '501010', 'Alternative Carriers', '50101010', '#d685b9', 1),
  ('50101020', 'industries_gics', '501010', 'Integrated Telecommunication Services', '50101020', '#d685b9', 2),
  ('501020', 'industries_gics', '5010', 'Wireless Telecommunication Services', '501020', '#bd629c', 2),
  ('50102010', 'industries_gics', '501020', 'Wireless Telecommunication Services', '50102010', '#d685b9', 1),
  ('5020', 'industries_gics', '50', 'Media & Entertainment', '5020', '#a34581', 2),
  ('502010', 'industries_gics', '5020', 'Media', '502010', '#bd629c', 1),
  ('50201010', 'industries_gics', '502010', 'Advertising', '50201010', '#d685b9', 1),
  ('50201020', 'industries_gics', '502010', 'Broadcasting', '50201020', '#d685b9', 2),
  ('50201030', 'industries_gics', '502010', 'Cable & Satellite', '50201030', '#d685b9', 3),
  ('50201040', 'industries_gics', '502010', 'Publishing', '50201040', '#d685b9', 4),
  ('502020', 'industries_gics', '5020', 'Entertainment', '502020', '#bd629c', 2),
  ('50202010', 'industries_gics', '502020', 'Movies & Entertainment', '50202010', '#d685b9', 1),
  ('50202020', 'industries_gics', '502020', 'Interactive Home Entertainment', '50202020', '#d685b9', 2),
  ('502030', 'industries_gics', '5020', 'Interactive Media & Services', '502030', '#bd629c', 3),
  ('50203010', 'industries_gics', '502030', 'Interactive Media & Services', '50203010', '#d685b9', 1);

-- Utilities Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('55', 'industries_gics', NULL, 'Utilities', '55', '#8a2c35', 10),
  ('5510', 'industries_gics', '55', 'Utilities', '5510', '#a3454e', 1),
  ('551010', 'industries_gics', '5510', 'Electric Utilities', '551010', '#bd626b', 1),
  ('55101010', 'industries_gics', '551010', 'Electric Utilities', '55101010', '#d6858d', 1),
  ('551020', 'industries_gics', '5510', 'Gas Utilities', '551020', '#bd626b', 2),
  ('55102010', 'industries_gics', '551020', 'Gas Utilities', '55102010', '#d6858d', 1),
  ('551030', 'industries_gics', '5510', 'Multi-Utilities', '551030', '#bd626b', 3),
  ('55103010', 'industries_gics', '551030', 'Multi-Utilities', '55103010', '#d6858d', 1),
  ('551040', 'industries_gics', '5510', 'Water Utilities', '551040', '#bd626b', 4),
  ('55104010', 'industries_gics', '551040', 'Water Utilities', '55104010', '#d6858d', 1),
  ('551050', 'industries_gics', '5510', 'Independent Power and Renewable Electricity Producers', '551050', '#bd626b', 5),
  ('55105010', 'industries_gics', '551050', 'Independent Power Producers & Energy Traders', '55105010', '#d6858d', 1),
  ('55105020', 'industries_gics', '551050', 'Renewable Electricity', '55105020', '#d6858d', 2);

-- Real Estate Sector
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('60', 'industries_gics', NULL, 'Real Estate', '60', '#8a562c', 11),
  ('6010', 'industries_gics', '60', 'Real Estate', '6010', '#a36f45', 1),
  ('601010', 'industries_gics', '6010', 'Equity Real Estate Investment Trusts (REITs)', '601010', '#bd8b62', 1),
  ('60101010', 'industries_gics', '601010', 'Diversified REITs', '60101010', '#d6aa85', 1),
  ('60101020', 'industries_gics', '601010', 'Industrial REITs', '60101020', '#d6aa85', 2),
  ('60101030', 'industries_gics', '601010', 'Hotel & Resort REITs', '60101030', '#d6aa85', 3),
  ('60101040', 'industries_gics', '601010', 'Office REITs', '60101040', '#d6aa85', 4),
  ('60101050', 'industries_gics', '601010', 'Health Care REITs', '60101050', '#d6aa85', 5),
  ('60101060', 'industries_gics', '601010', 'Residential REITs', '60101060', '#d6aa85', 6),
  ('60101070', 'industries_gics', '601010', 'Retail REITs', '60101070', '#d6aa85', 7),
  ('60101080', 'industries_gics', '601010', 'Specialized REITs', '60101080', '#d6aa85', 8),
  ('601020', 'industries_gics', '6010', 'Real Estate Management & Development', '601020', '#bd8b62', 2),
  ('60102010', 'industries_gics', '601020', 'Diversified Real Estate Activities', '60102010', '#d6aa85', 1),
  ('60102020', 'industries_gics', '601020', 'Real Estate Operating Companies', '60102020', '#d6aa85', 2),
  ('60102030', 'industries_gics', '601020', 'Real Estate Development', '60102030', '#d6aa85', 3),
  ('60102040', 'industries_gics', '601020', 'Real Estate Services', '60102040', '#d6aa85', 4);

-- ============================================================================
-- SEED DATA: REGIONS CATEGORIES
-- ============================================================================

-- Europe
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('R10', 'regions', NULL, 'Europe', 'R10', '#b8dcbc', 1),
  ('R1010', 'regions', 'R10', 'North Europe', 'R1010', '#d6fa92', 1),
  ('country_DK', 'regions', 'R1010', 'Denmark', 'country_DK', '#999cc3', 1),
  ('country_EE', 'regions', 'R1010', 'Estonia', 'country_EE', '#e8d6b4', 2),
  ('country_FI', 'regions', 'R1010', 'Finland', 'country_FI', '#b2c3e0', 3),
  ('country_GB', 'regions', 'R1010', 'Great Britain', 'country_GB', '#e0dab2', 4),
  ('country_IS', 'regions', 'R1010', 'Iceland', 'country_IS', '#b19dbb', 5),
  ('country_IE', 'regions', 'R1010', 'Ireland', 'country_IE', '#bfa3c0', 6),
  ('country_LV', 'regions', 'R1010', 'Latvia', 'country_LV', '#8cd9b9', 7),
  ('country_LT', 'regions', 'R1010', 'Lithuania', 'country_LT', '#83d6e9', 8),
  ('country_NO', 'regions', 'R1010', 'Norway', 'country_NO', '#f580e6', 9),
  ('country_SE', 'regions', 'R1010', 'Sweden', 'country_SE', '#cdacfd', 10),
  ('R1020', 'regions', 'R10', 'West Europe', 'R1020', '#b27f98', 2),
  ('country_AT', 'regions', 'R1020', 'Austria', 'country_AT', '#dbf5e7', 1),
  ('country_BE', 'regions', 'R1020', 'Belgium', 'country_BE', '#a7dbd2', 2),
  ('country_FR', 'regions', 'R1020', 'France', 'country_FR', '#d5e291', 3),
  ('country_DE', 'regions', 'R1020', 'Germany', 'country_DE', '#a7c2a8', 4),
  ('country_LI', 'regions', 'R1020', 'Liechtenstein', 'country_LI', '#c8bdfc', 5),
  ('country_LU', 'regions', 'R1020', 'Luxembourg', 'country_LU', '#e2f0de', 6),
  ('country_MC', 'regions', 'R1020', 'Monaco', 'country_MC', '#87d0ba', 7),
  ('country_NL', 'regions', 'R1020', 'Netherlands', 'country_NL', '#eaa1f1', 8),
  ('country_CH', 'regions', 'R1020', 'Switzerland', 'country_CH', '#859cdf', 9),
  ('R1030', 'regions', 'R10', 'East Europe', 'R1030', '#9bf191', 3),
  ('country_BY', 'regions', 'R1030', 'Belarus', 'country_BY', '#ca9484', 1),
  ('country_BG', 'regions', 'R1030', 'Bulgaria', 'country_BG', '#ef8aac', 2),
  ('country_CZ', 'regions', 'R1030', 'Czech Republic', 'country_CZ', '#f5ba93', 3),
  ('country_HU', 'regions', 'R1030', 'Hungary', 'country_HU', '#c39594', 4),
  ('country_PL', 'regions', 'R1030', 'Poland', 'country_PL', '#ddb4cc', 5),
  ('country_RO', 'regions', 'R1030', 'Romania', 'country_RO', '#9f7fd8', 6),
  ('country_RU', 'regions', 'R1030', 'Russia', 'country_RU', '#f1e4c3', 7),
  ('country_SK', 'regions', 'R1030', 'Slovakia', 'country_SK', '#f6deb6', 8),
  ('country_UA', 'regions', 'R1030', 'Ukraine', 'country_UA', '#f4c18b', 9),
  ('R1040', 'regions', 'R10', 'South Europe', 'R1040', '#cac783', 4),
  ('country_AL', 'regions', 'R1040', 'Albania', 'country_AL', '#a8e592', 1),
  ('country_AD', 'regions', 'R1040', 'Andorra', 'country_AD', '#c09dc3', 2),
  ('country_BA', 'regions', 'R1040', 'Bosnia and Herzegovina', 'country_BA', '#c287e2', 3),
  ('country_HR', 'regions', 'R1040', 'Croatia', 'country_HR', '#e3e8ab', 4),
  ('country_GI', 'regions', 'R1040', 'Gibraltar', 'country_GI', '#e08cbd', 5),
  ('country_GR', 'regions', 'R1040', 'Greece', 'country_GR', '#c7dc9b', 6),
  ('country_IT', 'regions', 'R1040', 'Italy', 'country_IT', '#cac88d', 7),
  ('country_MT', 'regions', 'R1040', 'Malta', 'country_MT', '#e6ed94', 8),
  ('country_ME', 'regions', 'R1040', 'Montenegro', 'country_ME', '#e39a8d', 9),
  ('country_PT', 'regions', 'R1040', 'Portugal', 'country_PT', '#88fab0', 10),
  ('country_SM', 'regions', 'R1040', 'San Marino', 'country_SM', '#b6cbe4', 11),
  ('country_RS', 'regions', 'R1040', 'Serbia', 'country_RS', '#b68994', 12),
  ('country_ES', 'regions', 'R1040', 'Spain', 'country_ES', '#f3cdbc', 13),
  ('country_VA', 'regions', 'R1040', 'Vatican city', 'country_VA', '#dcf7e9', 14);

-- America
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('R20', 'regions', NULL, 'America', 'R20', '#cfa9f7', 2),
  ('R2010', 'regions', 'R20', 'North America', 'R2010', '#a6c5ee', 1),
  ('country_BM', 'regions', 'R2010', 'Bermuda', 'country_BM', '#cadee9', 1),
  ('country_CA', 'regions', 'R2010', 'Canada', 'country_CA', '#9fa0d7', 2),
  ('country_GL', 'regions', 'R2010', 'Greenland', 'country_GL', '#8cbfb9', 3),
  ('country_MX', 'regions', 'R2010', 'Mexico', 'country_MX', '#a6f1c8', 4),
  ('country_PM', 'regions', 'R2010', 'Saint-Pierre and Miquelon', 'country_PM', '#d7a0a2', 5),
  ('country_US', 'regions', 'R2010', 'United States', 'country_US', '#8fa5e6', 6),
  ('R2020', 'regions', 'R20', 'Central America', 'R2020', '#8af1c5', 2),
  ('country_BZ', 'regions', 'R2020', 'Belize', 'country_BZ', '#eabfc3', 1),
  ('country_CR', 'regions', 'R2020', 'Costa Rica', 'country_CR', '#98aedb', 2),
  ('country_SV', 'regions', 'R2020', 'El Salvador', 'country_SV', '#a3dee0', 3),
  ('country_GT', 'regions', 'R2020', 'Guatemala', 'country_GT', '#d5d79d', 4),
  ('country_HN', 'regions', 'R2020', 'Honduras', 'country_HN', '#87d6dd', 5),
  ('country_NI', 'regions', 'R2020', 'Nicaragua', 'country_NI', '#b696e9', 6),
  ('country_PA', 'regions', 'R2020', 'Panama', 'country_PA', '#99a9e5', 7),
  ('R2030', 'regions', 'R20', 'Caribbean', 'R2030', '#deade6', 3),
  ('country_VI', 'regions', 'R2030', 'American Virgin Islands', 'country_VI', '#9d8b9c', 1),
  ('country_AI', 'regions', 'R2030', 'Anguilla', 'country_AI', '#bcc0f7', 2),
  ('country_AG', 'regions', 'R2030', 'Antigua and Barbuda', 'country_AG', '#9e83d7', 3),
  ('country_AW', 'regions', 'R2030', 'Aruba', 'country_AW', '#e7c9fc', 4),
  ('country_BS', 'regions', 'R2030', 'Bahamas', 'country_BS', '#f9dde6', 5),
  ('country_BB', 'regions', 'R2030', 'Barbados', 'country_BB', '#b7ebd5', 6),
  ('country_VG', 'regions', 'R2030', 'British Virgin Islands', 'country_VG', '#bed79f', 7),
  ('country_KY', 'regions', 'R2030', 'Cayman Islands', 'country_KY', '#c18bb2', 8),
  ('country_CU', 'regions', 'R2030', 'Cuba', 'country_CU', '#f6e1b5', 9),
  ('country_DM', 'regions', 'R2030', 'Dominica', 'country_DM', '#eb95e4', 10),
  ('country_DO', 'regions', 'R2030', 'Dominican Republic', 'country_DO', '#88d7c1', 11),
  ('country_GD', 'regions', 'R2030', 'Grenada', 'country_GD', '#cbf4ee', 12),
  ('country_GP', 'regions', 'R2030', 'Guadeloupe', 'country_GP', '#82c1d0', 13),
  ('country_HT', 'regions', 'R2030', 'Haiti', 'country_HT', '#aa859d', 14),
  ('country_JM', 'regions', 'R2030', 'Jamaica', 'country_JM', '#cfcfc7', 15),
  ('country_MQ', 'regions', 'R2030', 'Martinique', 'country_MQ', '#8eb0f6', 16),
  ('country_MS', 'regions', 'R2030', 'Montserrat', 'country_MS', '#ebecf0', 17),
  ('country_PR', 'regions', 'R2030', 'Puerto Rico', 'country_PR', '#bcead6', 18),
  ('country_MF', 'regions', 'R2030', 'Saint Martin', 'country_MF', '#a9bbb5', 19),
  ('country_SX', 'regions', 'R2030', 'Sint Maarten', 'country_SX', '#dfe3c5', 20),
  ('country_BL', 'regions', 'R2030', 'St. Barthélemy', 'country_BL', '#caf3fb', 21),
  ('country_KN', 'regions', 'R2030', 'St. Kitts and Nevis', 'country_KN', '#bbec92', 22),
  ('country_LC', 'regions', 'R2030', 'St. Lucia', 'country_LC', '#bea7fe', 23),
  ('country_VC', 'regions', 'R2030', 'St. Vincent and the Grenadines', 'country_VC', '#ddbcd0', 24),
  ('country_TT', 'regions', 'R2030', 'Trinidad and Tobago', 'country_TT', '#a0b1e9', 25),
  ('country_TC', 'regions', 'R2030', 'Turks and Caicos Islands', 'country_TC', '#85d4b0', 26),
  ('R2040', 'regions', 'R20', 'South America', 'R2040', '#a18daa', 4),
  ('country_AR', 'regions', 'R2040', 'Argentina', 'country_AR', '#ea98f7', 1),
  ('country_BO', 'regions', 'R2040', 'Bolivia', 'country_BO', '#bda6d5', 2),
  ('country_BR', 'regions', 'R2040', 'Brazil', 'country_BR', '#d781da', 3),
  ('country_CL', 'regions', 'R2040', 'Chile', 'country_CL', '#ded3a2', 4),
  ('country_CO', 'regions', 'R2040', 'Colombia', 'country_CO', '#a5f8d3', 5),
  ('country_EC', 'regions', 'R2040', 'Ecuador', 'country_EC', '#eabcca', 6),
  ('country_FK', 'regions', 'R2040', 'Falkland Islands', 'country_FK', '#80b8af', 7),
  ('country_GF', 'regions', 'R2040', 'French Guiana', 'country_GF', '#a9cde5', 8),
  ('country_GY', 'regions', 'R2040', 'Guyana', 'country_GY', '#dbab9c', 9),
  ('country_PY', 'regions', 'R2040', 'Paraguay', 'country_PY', '#9c8cdc', 10),
  ('country_PE', 'regions', 'R2040', 'Peru', 'country_PE', '#a891b6', 11),
  ('country_SR', 'regions', 'R2040', 'Suriname', 'country_SR', '#d6ea9e', 12),
  ('country_UY', 'regions', 'R2040', 'Uruguay', 'country_UY', '#d8c7fc', 13),
  ('country_VE', 'regions', 'R2040', 'Venezuela', 'country_VE', '#d6d5bb', 14);

-- Asia
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('R30', 'regions', NULL, 'Asia', 'R30', '#f8dbef', 3),
  ('R3010', 'regions', 'R30', 'West Asia (Near Asia)', 'R3010', '#a2f3f0', 1),
  ('country_AM', 'regions', 'R3010', 'Armenia', 'country_AM', '#b5b3e4', 1),
  ('country_AZ', 'regions', 'R3010', 'Azerbaijan', 'country_AZ', '#9fa0bf', 2),
  ('country_BH', 'regions', 'R3010', 'Bahrain', 'country_BH', '#da7fbf', 3),
  ('country_CY', 'regions', 'R3010', 'Cyprus', 'country_CY', '#c6a380', 4),
  ('country_GE', 'regions', 'R3010', 'Georgia', 'country_GE', '#b98ec7', 5),
  ('country_IQ', 'regions', 'R3010', 'Iraq', 'country_IQ', '#e1f7c1', 6),
  ('country_IL', 'regions', 'R3010', 'Israel', 'country_IL', '#f2edf2', 7),
  ('country_JO', 'regions', 'R3010', 'Jordan', 'country_JO', '#93fbd3', 8),
  ('country_KW', 'regions', 'R3010', 'Kuwait', 'country_KW', '#f4b9d7', 9),
  ('country_LB', 'regions', 'R3010', 'Lebanon', 'country_LB', '#afa9cc', 10),
  ('country_OM', 'regions', 'R3010', 'Oman', 'country_OM', '#c5f4c8', 11),
  ('country_QA', 'regions', 'R3010', 'Qatar', 'country_QA', '#cf8e9e', 12),
  ('country_SA', 'regions', 'R3010', 'Saudi Arabia', 'country_SA', '#accc99', 13),
  ('country_SY', 'regions', 'R3010', 'Syria', 'country_SY', '#c98fc0', 14),
  ('country_TR', 'regions', 'R3010', 'Turkey', 'country_TR', '#d293c5', 15),
  ('country_AE', 'regions', 'R3010', 'United Arab Emirates', 'country_AE', '#f3c3b3', 16),
  ('country_YE', 'regions', 'R3010', 'Yemen', 'country_YE', '#fca1fe', 17),
  ('R3020', 'regions', 'R30', 'Central Asia', 'R3020', '#8db5ec', 2),
  ('country_KZ', 'regions', 'R3020', 'Kazakhstan', 'country_KZ', '#c9c4f4', 1),
  ('country_KG', 'regions', 'R3020', 'Kyrgyzstan', 'country_KG', '#f8d3af', 2),
  ('country_TJ', 'regions', 'R3020', 'Tajikistan', 'country_TJ', '#dbbcbf', 3),
  ('country_TM', 'regions', 'R3020', 'Turkmenistan', 'country_TM', '#c2fb86', 4),
  ('country_UZ', 'regions', 'R3020', 'Uzbekistan', 'country_UZ', '#8e8a96', 5),
  ('R3030', 'regions', 'R30', 'East Asia', 'R3030', '#c39691', 3),
  ('country_CN', 'regions', 'R3030', 'China', 'country_CN', '#f0b091', 1),
  ('country_HK', 'regions', 'R3030', 'Hong Kong', 'country_HK', '#eef0d0', 2),
  ('country_JP', 'regions', 'R3030', 'Japan', 'country_JP', '#c2c6df', 3),
  ('country_MO', 'regions', 'R3030', 'Macau', 'country_MO', '#99c9a1', 4),
  ('country_MN', 'regions', 'R3030', 'Mongolia', 'country_MN', '#d1a1c9', 5),
  ('country_KP', 'regions', 'R3030', 'North Korea', 'country_KP', '#988ccc', 6),
  ('country_KR', 'regions', 'R3030', 'South Korea', 'country_KR', '#eed2d1', 7),
  ('country_TW', 'regions', 'R3030', 'Taiwan', 'country_TW', '#afa6f4', 8),
  ('R3040', 'regions', 'R30', 'South Asia', 'R3040', '#e9c6bf', 4),
  ('country_AF', 'regions', 'R3040', 'Afghanistan', 'country_AF', '#82de8b', 1),
  ('country_BD', 'regions', 'R3040', 'Bangladesh', 'country_BD', '#9dceb4', 2),
  ('country_BT', 'regions', 'R3040', 'Bhutan', 'country_BT', '#95ae86', 3),
  ('country_IN', 'regions', 'R3040', 'India', 'country_IN', '#f5f190', 4),
  ('country_IR', 'regions', 'R3040', 'Iran', 'country_IR', '#f1ab97', 5),
  ('country_MV', 'regions', 'R3040', 'Maldives', 'country_MV', '#c7bf85', 6),
  ('country_NP', 'regions', 'R3040', 'Nepal', 'country_NP', '#abdcc5', 7),
  ('country_PK', 'regions', 'R3040', 'Pakistan', 'country_PK', '#b2a58f', 8),
  ('country_LK', 'regions', 'R3040', 'Sri Lanka', 'country_LK', '#7fa9a4', 9),
  ('R3050', 'regions', 'R30', 'Southeast Asia', 'R3050', '#f28f7f', 5),
  ('country_BN', 'regions', 'R3050', 'Brunei Darussalam', 'country_BN', '#83b391', 1),
  ('country_KH', 'regions', 'R3050', 'Cambodia', 'country_KH', '#f28dd1', 2),
  ('country_ID', 'regions', 'R3050', 'Indonesia', 'country_ID', '#cc8ec3', 3),
  ('country_LA', 'regions', 'R3050', 'Laos', 'country_LA', '#dd85a5', 4),
  ('country_MY', 'regions', 'R3050', 'Malaysia', 'country_MY', '#b0aae1', 5),
  ('country_MM', 'regions', 'R3050', 'Myanmar', 'country_MM', '#b592d1', 6),
  ('country_PH', 'regions', 'R3050', 'Philippines', 'country_PH', '#92bed0', 7),
  ('country_SG', 'regions', 'R3050', 'Singapore', 'country_SG', '#dd989e', 8),
  ('country_TH', 'regions', 'R3050', 'Thailand', 'country_TH', '#c7c9d4', 9),
  ('country_TL', 'regions', 'R3050', 'Timor Leste', 'country_TL', '#addbef', 10),
  ('country_VN', 'regions', 'R3050', 'Vietnam', 'country_VN', '#fbe1a5', 11);

-- Africa
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('R40', 'regions', NULL, 'Africa', 'R40', '#8be8ca', 4),
  ('R4010', 'regions', 'R40', 'North Africa', 'R4010', '#84cbc7', 1),
  ('country_DZ', 'regions', 'R4010', 'Algeria', 'country_DZ', '#a5dee1', 1),
  ('country_EG', 'regions', 'R4010', 'Egypt', 'country_EG', '#ac83d9', 2),
  ('country_LY', 'regions', 'R4010', 'Libya', 'country_LY', '#9e9f9a', 3),
  ('country_MA', 'regions', 'R4010', 'Morocco', 'country_MA', '#c5ce9e', 4),
  ('country_SS', 'regions', 'R4010', 'Sudan', 'country_SS', '#a1abfe', 5),
  ('country_TN', 'regions', 'R4010', 'Tunisia', 'country_TN', '#9e81e4', 6),
  ('country_EH', 'regions', 'R4010', 'Western Sahara', 'country_EH', '#a9de88', 7),
  ('R4020', 'regions', 'R40', 'West Africa', 'R4020', '#b1f3a3', 2),
  ('country_BJ', 'regions', 'R4020', 'Benin', 'country_BJ', '#8e9f91', 1),
  ('country_BF', 'regions', 'R4020', 'Burkina Faso', 'country_BF', '#88d8d7', 2),
  ('country_CV', 'regions', 'R4020', 'Cape Verde', 'country_CV', '#c5f9d6', 3),
  ('country_GM', 'regions', 'R4020', 'Gambia', 'country_GM', '#f5b9ec', 4),
  ('country_GH', 'regions', 'R4020', 'Ghana', 'country_GH', '#d59bc2', 5),
  ('country_GQ', 'regions', 'R4020', 'Guinea', 'country_GQ', '#e0b2af', 6),
  ('country_GW', 'regions', 'R4020', 'Guinea-Bissau', 'country_GW', '#9ff3e0', 7),
  ('country_LR', 'regions', 'R4020', 'Liberia', 'country_LR', '#b49585', 8),
  ('country_ML', 'regions', 'R4020', 'Mali', 'country_ML', '#c897ae', 9),
  ('country_MR', 'regions', 'R4020', 'Mauritania', 'country_MR', '#eff380', 10),
  ('country_NE', 'regions', 'R4020', 'Niger', 'country_NE', '#a7d9f7', 11),
  ('country_NG', 'regions', 'R4020', 'Nigeria', 'country_NG', '#bb899f', 12),
  ('country_SN', 'regions', 'R4020', 'Senegal', 'country_SN', '#e08fdf', 13),
  ('country_SL', 'regions', 'R4020', 'Sierra Leone', 'country_SL', '#e2e4ed', 14),
  ('country_SH', 'regions', 'R4020', 'St. Helena', 'country_SH', '#9ddf87', 15),
  ('country_TG', 'regions', 'R4020', 'Togo', 'country_TG', '#95b0c0', 16),
  ('R4030', 'regions', 'R40', 'East Africa', 'R4030', '#da94fc', 3),
  ('country_IO', 'regions', 'R4030', 'British Indian Ocean Territory', 'country_IO', '#9e87e8', 1),
  ('country_BI', 'regions', 'R4030', 'Burundi', 'country_BI', '#e7d0c4', 2),
  ('country_KM', 'regions', 'R4030', 'Comoros', 'country_KM', '#b8d685', 3),
  ('country_DJ', 'regions', 'R4030', 'Djibouti', 'country_DJ', '#8ac4d0', 4),
  ('country_ER', 'regions', 'R4030', 'Eritrea', 'country_ER', '#9ccca0', 5),
  ('country_ET', 'regions', 'R4030', 'Ethiopia', 'country_ET', '#b8bad2', 6),
  ('country_TF', 'regions', 'R4030', 'French Southern and Antarctic Lands', 'country_TF', '#a0b199', 7),
  ('country_KE', 'regions', 'R4030', 'Kenya', 'country_KE', '#8995f8', 8),
  ('country_MG', 'regions', 'R4030', 'Madagascar', 'country_MG', '#87b0dd', 9),
  ('country_MW', 'regions', 'R4030', 'Malawi', 'country_MW', '#a5baa3', 10),
  ('country_MU', 'regions', 'R4030', 'Mauritius', 'country_MU', '#818ee1', 11),
  ('country_YT', 'regions', 'R4030', 'Mayotte', 'country_YT', '#cacfb4', 12),
  ('country_MZ', 'regions', 'R4030', 'Mozambique', 'country_MZ', '#93e6a3', 13),
  ('country_RE', 'regions', 'R4030', 'Reunion', 'country_RE', '#f2b396', 14),
  ('country_RW', 'regions', 'R4030', 'Rwanda', 'country_RW', '#bb8deb', 15),
  ('country_SC', 'regions', 'R4030', 'Seychelles', 'country_SC', '#81a3c8', 16),
  ('country_SO', 'regions', 'R4030', 'Somalia', 'country_SO', '#fb939c', 17),
  ('country_SD', 'regions', 'R4030', 'South Sudan', 'country_SD', '#9880bc', 18),
  ('country_TZ', 'regions', 'R4030', 'Tanzania', 'country_TZ', '#eae1bc', 19),
  ('country_UG', 'regions', 'R4030', 'Uganda', 'country_UG', '#c49cb6', 20),
  ('country_ZM', 'regions', 'R4030', 'Zambia', 'country_ZM', '#f4d68b', 21),
  ('country_ZW', 'regions', 'R4030', 'Zimbabwe', 'country_ZW', '#bdee8e', 22),
  ('R4040', 'regions', 'R40', 'Central Africa', 'R4040', '#c29cd0', 4),
  ('country_AO', 'regions', 'R4040', 'Angola', 'country_AO', '#babaf7', 1),
  ('country_CM', 'regions', 'R4040', 'Cameroon', 'country_CM', '#93dd82', 2),
  ('country_CF', 'regions', 'R4040', 'Central African Republic', 'country_CF', '#df90b4', 3),
  ('country_TD', 'regions', 'R4040', 'Chad', 'country_TD', '#e4b69d', 4),
  ('country_CD', 'regions', 'R4040', 'Democratic Republic of Congo', 'country_CD', '#d9b7b4', 5),
  ('country_GA', 'regions', 'R4040', 'Gabon', 'country_GA', '#ce88c7', 6),
  ('country_CG', 'regions', 'R4040', 'Republic of the Congo', 'country_CG', '#b6d3ef', 7),
  ('country_ST', 'regions', 'R4040', 'Sao Tome and Principe', 'country_ST', '#ccb494', 8),
  ('R4050', 'regions', 'R40', 'South Africa', 'R4050', '#fca396', 5),
  ('country_LS', 'regions', 'R4050', 'Lesotho', 'country_LS', '#e38ec8', 1),
  ('country_NA', 'regions', 'R4050', 'Namibia', 'country_NA', '#eb82ce', 2),
  ('country_ZA', 'regions', 'R4050', 'South Africa', 'country_ZA', '#e1b2a6', 3);

-- Oceania
INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('R50', 'regions', NULL, 'Oceania', 'R50', '#92a8eb', 5),
  ('R5010', 'regions', 'R50', 'Australia and New Zealand', 'R5010', '#7feec7', 1),
  ('country_AU', 'regions', 'R5010', 'Australia', 'country_AU', '#eda4ea', 1),
  ('country_NZ', 'regions', 'R5010', 'New Zealand', 'country_NZ', '#97a491', 2),
  ('country_NF', 'regions', 'R5010', 'Norfolk Island', 'country_NF', '#a4dfed', 3),
  ('R5020', 'regions', 'R50', 'Melanesia', 'R5020', '#e78caf', 2),
  ('country_FJ', 'regions', 'R5020', 'Fiji', 'country_FJ', '#7faf82', 1),
  ('country_NC', 'regions', 'R5020', 'New Caledonia', 'country_NC', '#db84b2', 2),
  ('country_PG', 'regions', 'R5020', 'Papua New Guinea', 'country_PG', '#96aaa0', 3),
  ('country_VU', 'regions', 'R5020', 'Vanuatu', 'country_VU', '#bfaaa5', 4),
  ('R5030', 'regions', 'R50', 'Micronesia', 'R5030', '#f59696', 3),
  ('country_GU', 'regions', 'R5030', 'Guam', 'country_GU', '#dbdf92', 1),
  ('country_KI', 'regions', 'R5030', 'Kiribati', 'country_KI', '#a7e1e0', 2),
  ('country_MH', 'regions', 'R5030', 'Marshall Islands', 'country_MH', '#9ffbb4', 3),
  ('country_FM', 'regions', 'R5030', 'Micronesia', 'country_FM', '#b4ae83', 4),
  ('country_NR', 'regions', 'R5030', 'Nauru', 'country_NR', '#87ea93', 5),
  ('country_MP', 'regions', 'R5030', 'Northern Mariana Islands', 'country_MP', '#caa499', 6),
  ('country_PW', 'regions', 'R5030', 'Palau', 'country_PW', '#ddf794', 7),
  ('R5040', 'regions', 'R50', 'Polynesia', 'R5040', '#f5e0f6', 4),
  ('country_AS', 'regions', 'R5040', 'American Samoa', 'country_AS', '#fda48a', 1),
  ('country_CK', 'regions', 'R5040', 'Cook Islands', 'country_CK', '#d6d4df', 2),
  ('country_PF', 'regions', 'R5040', 'French Polynesia', 'country_PF', '#a58580', 3),
  ('country_NU', 'regions', 'R5040', 'Niue', 'country_NU', '#99fcd9', 4),
  ('country_PN', 'regions', 'R5040', 'Pitcairn Islands', 'country_PN', '#94c6b4', 5),
  ('country_WS', 'regions', 'R5040', 'Samoa', 'country_WS', '#93c5c5', 6),
  ('country_TK', 'regions', 'R5040', 'Tokelau', 'country_TK', '#b9aa9b', 7),
  ('country_TO', 'regions', 'R5040', 'Tonga', 'country_TO', '#f188a1', 8),
  ('country_TV', 'regions', 'R5040', 'Tuvalu', 'country_TV', '#d481ba', 9),
  ('country_WF', 'regions', 'R5040', 'Wallis and Futuna', 'country_WF', '#dd80d4', 10);
