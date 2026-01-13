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
  ('type_of_security', 'Type of Security', '#4385be',
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
-- SEED DATA: TYPE OF SECURITY CATEGORIES
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('STOCK',  'type_of_security', NULL, 'Stock',                      'STOCK',  '#4385be', 1),
  ('FUND',   'type_of_security', NULL, 'Fund',                       'FUND',   '#3aa99f', 2),
  ('ETF',    'type_of_security', NULL, 'Exchange Traded Fund (ETF)', 'ETF',    '#8b7ec8', 3),
  ('BOND',   'type_of_security', NULL, 'Bond',                       'BOND',   '#879a39', 4),
  ('OPTION', 'type_of_security', NULL, 'Option',                     'OPTION', '#da702c', 5),
  ('CASH',   'type_of_security', NULL, 'Cash',                       'CASH',   '#d0a215', 6),
  ('CRYPTO', 'type_of_security', NULL, 'Cryptocurrency',             'CRYPTO', '#ce5d97', 7);

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
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('CASH',        'asset_classes', NULL, 'Cash',        'CASH',        '#c437c2', 1),
  ('EQUITY',      'asset_classes', NULL, 'Equity',      'EQUITY',      '#5757ff', 2),
  ('DEBT',        'asset_classes', NULL, 'Debt',        'DEBT',        '#dca122', 3),
  ('REAL_ESTATE', 'asset_classes', NULL, 'Real Estate', 'REAL_ESTATE', '#fd6a0e', 4),
  ('COMMODITY',   'asset_classes', NULL, 'Commodity',   'COMMODITY',   '#579f57', 5);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Energy
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Materials
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Industrials
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Consumer Discretionary
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Consumer Staples
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Health Care
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Financials
-- ============================================================================

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
  ('402040', 'industries_gics', '4020', 'Mortgage REITs', '402040', '#7b62bd', 4),
  ('40204010', 'industries_gics', '402040', 'Mortgage REITs', '40204010', '#9b85d6', 1),
  ('4030', 'industries_gics', '40', 'Insurance', '4030', '#5e45a3', 3),
  ('403010', 'industries_gics', '4030', 'Insurance', '403010', '#7b62bd', 1),
  ('40301010', 'industries_gics', '403010', 'Insurance Brokers', '40301010', '#9b85d6', 1),
  ('40301020', 'industries_gics', '403010', 'Life & Health Insurance', '40301020', '#9b85d6', 2),
  ('40301030', 'industries_gics', '403010', 'Multi-line Insurance', '40301030', '#9b85d6', 3),
  ('40301040', 'industries_gics', '403010', 'Property & Casualty Insurance', '40301040', '#9b85d6', 4),
  ('40301050', 'industries_gics', '403010', 'Reinsurance', '40301050', '#9b85d6', 5);

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Information Technology
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Communication Services
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Utilities
-- ============================================================================

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

-- ============================================================================
-- SEED DATA: INDUSTRIES (GICS) - Real Estate
-- ============================================================================

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
-- SEED DATA: REGIONS - Major regions only (simplified)
-- Full country data can be added via user-initiated migration
-- ============================================================================

INSERT INTO taxonomy_categories (id, taxonomy_id, parent_id, name, key, color, sort_order)
VALUES
  ('R10', 'regions', NULL, 'Europe', 'R10', '#b8dcbc', 1),
  ('R20', 'regions', NULL, 'Americas', 'R20', '#cfa9f7', 2),
  ('R2010', 'regions', 'R20', 'North America', 'R2010', '#a6c5ee', 1),
  ('country_US', 'regions', 'R2010', 'United States', 'country_US', '#8fa5e6', 1),
  ('country_CA', 'regions', 'R2010', 'Canada', 'country_CA', '#9fa0d7', 2),
  ('R2040', 'regions', 'R20', 'South America', 'R2040', '#a18daa', 2),
  ('R30', 'regions', NULL, 'Asia', 'R30', '#f8dbef', 3),
  ('R3030', 'regions', 'R30', 'East Asia', 'R3030', '#c39691', 1),
  ('country_JP', 'regions', 'R3030', 'Japan', 'country_JP', '#c2c6df', 1),
  ('country_CN', 'regions', 'R3030', 'China', 'country_CN', '#f0b091', 2),
  ('country_HK', 'regions', 'R3030', 'Hong Kong', 'country_HK', '#eef0d0', 3),
  ('R40', 'regions', NULL, 'Africa', 'R40', '#8be8ca', 4),
  ('R50', 'regions', NULL, 'Oceania', 'R50', '#92a8eb', 5),
  ('country_AU', 'regions', 'R50', 'Australia', 'country_AU', '#eda4ea', 1);

-- ============================================================================
-- AUTO-MIGRATE: asset_class -> asset_classes TAXONOMY
-- Reads from metadata.legacy.asset_class (set by core_schema_redesign)
-- ============================================================================

INSERT INTO asset_taxonomy_assignments (id, asset_id, taxonomy_id, category_id, weight, source)
SELECT
    lower(hex(randomblob(16))),
    a.id,
    'asset_classes',
    CASE
        WHEN json_extract(a.metadata, '$.legacy.asset_class') = 'Equity' THEN 'EQUITY'
        WHEN json_extract(a.metadata, '$.legacy.asset_class') = 'Cash' THEN 'CASH'
        WHEN json_extract(a.metadata, '$.legacy.asset_class') = 'Commodity' THEN 'COMMODITY'
        WHEN json_extract(a.metadata, '$.legacy.asset_class') LIKE '%Real Estate%' THEN 'REAL_ESTATE'
        WHEN json_extract(a.metadata, '$.legacy.asset_class') LIKE '%Bond%'
          OR json_extract(a.metadata, '$.legacy.asset_class') LIKE '%Debt%'
          OR json_extract(a.metadata, '$.legacy.asset_class') LIKE '%Fixed%' THEN 'DEBT'
        ELSE NULL
    END,
    10000,
    'migrated'
FROM assets a
WHERE json_extract(a.metadata, '$.legacy.asset_class') IS NOT NULL
  AND CASE
        WHEN json_extract(a.metadata, '$.legacy.asset_class') = 'Equity' THEN 'EQUITY'
        WHEN json_extract(a.metadata, '$.legacy.asset_class') = 'Cash' THEN 'CASH'
        WHEN json_extract(a.metadata, '$.legacy.asset_class') = 'Commodity' THEN 'COMMODITY'
        WHEN json_extract(a.metadata, '$.legacy.asset_class') LIKE '%Real Estate%' THEN 'REAL_ESTATE'
        WHEN json_extract(a.metadata, '$.legacy.asset_class') LIKE '%Bond%'
          OR json_extract(a.metadata, '$.legacy.asset_class') LIKE '%Debt%'
          OR json_extract(a.metadata, '$.legacy.asset_class') LIKE '%Fixed%' THEN 'DEBT'
        ELSE NULL
      END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'asset_classes'
  );

-- ============================================================================
-- AUTO-MIGRATE: asset_sub_class -> type_of_security TAXONOMY
-- Reads from metadata.legacy.asset_sub_class (set by core_schema_redesign)
-- ============================================================================

INSERT INTO asset_taxonomy_assignments (id, asset_id, taxonomy_id, category_id, weight, source)
SELECT
    lower(hex(randomblob(16))),
    a.id,
    'type_of_security',
    CASE
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'Stock' THEN 'STOCK'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'ETF' THEN 'ETF'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'Mutual Fund' THEN 'FUND'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'Cryptocurrency' THEN 'CRYPTO'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'Cash' THEN 'CASH'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') LIKE '%Bond%' THEN 'BOND'
        ELSE NULL
    END,
    10000,
    'migrated'
FROM assets a
WHERE json_extract(a.metadata, '$.legacy.asset_sub_class') IS NOT NULL
  AND CASE
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'Stock' THEN 'STOCK'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'ETF' THEN 'ETF'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'Mutual Fund' THEN 'FUND'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'Cryptocurrency' THEN 'CRYPTO'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') = 'Cash' THEN 'CASH'
        WHEN json_extract(a.metadata, '$.legacy.asset_sub_class') LIKE '%Bond%' THEN 'BOND'
        ELSE NULL
      END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'type_of_security'
  );

-- ============================================================================
-- CLEANUP: Remove legacy metadata, keep only identifiers
-- Now that all classifications are created from legacy data, we can clean up
-- the temporary $.legacy structure. The $.identifiers structure was already
-- created in the correct format by 000001_core_schema_redesign.
-- ============================================================================

UPDATE assets
SET metadata = CASE
    WHEN json_extract(metadata, '$.identifiers') IS NOT NULL
    THEN json_object('identifiers', json_extract(metadata, '$.identifiers'))
    ELSE NULL
END
WHERE json_extract(metadata, '$.legacy') IS NOT NULL;
