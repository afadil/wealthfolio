-- ============================================================================
-- Combined migration for cash activity features:
-- 1. Categories (with seed data)
-- 2. Category Rules
-- 3. Event Types and Events
-- 4. Activity table extensions (name, category_id, sub_category_id, event_id)
-- ============================================================================

-- ============================================================================
-- PART 1: CATEGORIES
-- ============================================================================

-- Create categories table for expense/income categorization
CREATE TABLE categories (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    color TEXT,
    icon TEXT,
    is_income INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Create indexes for categories
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_is_income ON categories(is_income);

-- Seed default expense categories (is_income = 0)
-- Parent categories
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_housing', 'Housing', NULL, '#4A90A4', 'Home', 0, 1, datetime('now'), datetime('now')),
    ('cat_food', 'Food & Dining', NULL, '#E67E22', 'UtensilsCrossed', 0, 2, datetime('now'), datetime('now')),
    ('cat_transport', 'Transportation', NULL, '#3498DB', 'Car', 0, 3, datetime('now'), datetime('now')),
    ('cat_shopping', 'Shopping', NULL, '#9B59B6', 'ShoppingBag', 0, 4, datetime('now'), datetime('now')),
    ('cat_entertainment', 'Entertainment', NULL, '#E91E63', 'Film', 0, 5, datetime('now'), datetime('now')),
    ('cat_health', 'Health & Wellness', NULL, '#27AE60', 'Heart', 0, 6, datetime('now'), datetime('now')),
    ('cat_bills', 'Bills & Utilities', NULL, '#F39C12', 'FileText', 0, 7, datetime('now'), datetime('now')),
    ('cat_personal', 'Personal Care', NULL, '#1ABC9C', 'User', 0, 8, datetime('now'), datetime('now')),
    ('cat_education', 'Education', NULL, '#8E44AD', 'GraduationCap', 0, 9, datetime('now'), datetime('now')),
    ('cat_travel', 'Travel', NULL, '#00BCD4', 'Plane', 0, 10, datetime('now'), datetime('now')),
    ('cat_gifts', 'Gifts & Donations', NULL, '#E74C3C', 'Gift', 0, 11, datetime('now'), datetime('now')),
    ('cat_fees', 'Fees & Charges', NULL, '#95A5A6', 'CreditCard', 0, 12, datetime('now'), datetime('now')),
    ('cat_other_expense', 'Other Expenses', NULL, '#7F8C8D', 'MoreHorizontal', 0, 99, datetime('now'), datetime('now'));

-- Subcategories for Housing
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_housing_rent', 'Rent/Mortgage', 'cat_housing', '#4A90A4', 'Home', 0, 1, datetime('now'), datetime('now')),
    ('cat_housing_utilities', 'Utilities', 'cat_housing', '#4A90A4', 'Lightbulb', 0, 2, datetime('now'), datetime('now')),
    ('cat_housing_insurance', 'Home Insurance', 'cat_housing', '#4A90A4', 'Shield', 0, 3, datetime('now'), datetime('now')),
    ('cat_housing_maintenance', 'Maintenance & Repairs', 'cat_housing', '#4A90A4', 'Wrench', 0, 4, datetime('now'), datetime('now')),
    ('cat_housing_furnishing', 'Furnishing', 'cat_housing', '#4A90A4', 'Sofa', 0, 5, datetime('now'), datetime('now'));

-- Subcategories for Food & Dining
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_food_groceries', 'Groceries', 'cat_food', '#E67E22', 'ShoppingCart', 0, 1, datetime('now'), datetime('now')),
    ('cat_food_restaurants', 'Restaurants', 'cat_food', '#E67E22', 'UtensilsCrossed', 0, 2, datetime('now'), datetime('now')),
    ('cat_food_coffee', 'Coffee Shops', 'cat_food', '#E67E22', 'Coffee', 0, 3, datetime('now'), datetime('now')),
    ('cat_food_delivery', 'Food Delivery', 'cat_food', '#E67E22', 'Truck', 0, 4, datetime('now'), datetime('now')),
    ('cat_food_alcohol', 'Bars & Alcohol', 'cat_food', '#E67E22', 'Wine', 0, 5, datetime('now'), datetime('now'));

-- Subcategories for Transportation
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_transport_gas', 'Gas & Fuel', 'cat_transport', '#3498DB', 'Fuel', 0, 1, datetime('now'), datetime('now')),
    ('cat_transport_parking', 'Parking', 'cat_transport', '#3498DB', 'ParkingCircle', 0, 2, datetime('now'), datetime('now')),
    ('cat_transport_public', 'Public Transit', 'cat_transport', '#3498DB', 'Train', 0, 3, datetime('now'), datetime('now')),
    ('cat_transport_rideshare', 'Rideshare & Taxi', 'cat_transport', '#3498DB', 'Car', 0, 4, datetime('now'), datetime('now')),
    ('cat_transport_maintenance', 'Car Maintenance', 'cat_transport', '#3498DB', 'Wrench', 0, 5, datetime('now'), datetime('now')),
    ('cat_transport_insurance', 'Auto Insurance', 'cat_transport', '#3498DB', 'Shield', 0, 6, datetime('now'), datetime('now'));

-- Subcategories for Shopping
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_shopping_clothing', 'Clothing', 'cat_shopping', '#9B59B6', 'Shirt', 0, 1, datetime('now'), datetime('now')),
    ('cat_shopping_electronics', 'Electronics', 'cat_shopping', '#9B59B6', 'Smartphone', 0, 2, datetime('now'), datetime('now')),
    ('cat_shopping_home', 'Home Goods', 'cat_shopping', '#9B59B6', 'Home', 0, 3, datetime('now'), datetime('now')),
    ('cat_shopping_online', 'Online Shopping', 'cat_shopping', '#9B59B6', 'Globe', 0, 4, datetime('now'), datetime('now'));

-- Subcategories for Entertainment
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_entertainment_streaming', 'Streaming Services', 'cat_entertainment', '#E91E63', 'Tv', 0, 1, datetime('now'), datetime('now')),
    ('cat_entertainment_movies', 'Movies & Events', 'cat_entertainment', '#E91E63', 'Film', 0, 2, datetime('now'), datetime('now')),
    ('cat_entertainment_games', 'Games & Apps', 'cat_entertainment', '#E91E63', 'Gamepad2', 0, 3, datetime('now'), datetime('now')),
    ('cat_entertainment_hobbies', 'Hobbies', 'cat_entertainment', '#E91E63', 'Palette', 0, 4, datetime('now'), datetime('now')),
    ('cat_entertainment_sports', 'Sports & Recreation', 'cat_entertainment', '#E91E63', 'Dumbbell', 0, 5, datetime('now'), datetime('now'));

-- Subcategories for Health & Wellness
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_health_medical', 'Medical', 'cat_health', '#27AE60', 'Stethoscope', 0, 1, datetime('now'), datetime('now')),
    ('cat_health_pharmacy', 'Pharmacy', 'cat_health', '#27AE60', 'Pill', 0, 2, datetime('now'), datetime('now')),
    ('cat_health_dental', 'Dental', 'cat_health', '#27AE60', 'Smile', 0, 3, datetime('now'), datetime('now')),
    ('cat_health_vision', 'Vision', 'cat_health', '#27AE60', 'Eye', 0, 4, datetime('now'), datetime('now')),
    ('cat_health_fitness', 'Gym & Fitness', 'cat_health', '#27AE60', 'Dumbbell', 0, 5, datetime('now'), datetime('now')),
    ('cat_health_insurance', 'Health Insurance', 'cat_health', '#27AE60', 'Shield', 0, 6, datetime('now'), datetime('now'));

-- Subcategories for Bills & Utilities
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_bills_phone', 'Phone', 'cat_bills', '#F39C12', 'Smartphone', 0, 1, datetime('now'), datetime('now')),
    ('cat_bills_internet', 'Internet', 'cat_bills', '#F39C12', 'Wifi', 0, 2, datetime('now'), datetime('now')),
    ('cat_bills_subscriptions', 'Subscriptions', 'cat_bills', '#F39C12', 'Calendar', 0, 3, datetime('now'), datetime('now')),
    ('cat_bills_software', 'Software & Services', 'cat_bills', '#F39C12', 'Code', 0, 4, datetime('now'), datetime('now'));

-- Subcategories for Fees & Charges
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_fees_bank', 'Bank Fees', 'cat_fees', '#95A5A6', 'Building', 0, 1, datetime('now'), datetime('now')),
    ('cat_fees_atm', 'ATM Fees', 'cat_fees', '#95A5A6', 'Banknote', 0, 2, datetime('now'), datetime('now')),
    ('cat_fees_interest', 'Interest Charges', 'cat_fees', '#95A5A6', 'Percent', 0, 3, datetime('now'), datetime('now')),
    ('cat_fees_late', 'Late Fees', 'cat_fees', '#95A5A6', 'AlertCircle', 0, 4, datetime('now'), datetime('now'));

-- Seed default income categories (is_income = 1)
-- Parent categories
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_income_employment', 'Employment', NULL, '#27AE60', 'Briefcase', 1, 1, datetime('now'), datetime('now')),
    ('cat_income_selfemploy', 'Self-Employment', NULL, '#2ECC71', 'User', 1, 2, datetime('now'), datetime('now')),
    ('cat_income_investment', 'Investment Income', NULL, '#16A085', 'TrendingUp', 1, 3, datetime('now'), datetime('now')),
    ('cat_income_other', 'Other Income', NULL, '#1ABC9C', 'DollarSign', 1, 4, datetime('now'), datetime('now'));

-- Subcategories for Employment
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_income_salary', 'Salary', 'cat_income_employment', '#27AE60', 'Briefcase', 1, 1, datetime('now'), datetime('now')),
    ('cat_income_bonus', 'Bonus', 'cat_income_employment', '#27AE60', 'Award', 1, 2, datetime('now'), datetime('now')),
    ('cat_income_commission', 'Commission', 'cat_income_employment', '#27AE60', 'Target', 1, 3, datetime('now'), datetime('now'));

-- Subcategories for Self-Employment
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_income_freelance', 'Freelance', 'cat_income_selfemploy', '#2ECC71', 'Laptop', 1, 1, datetime('now'), datetime('now')),
    ('cat_income_business', 'Business Income', 'cat_income_selfemploy', '#2ECC71', 'Building', 1, 2, datetime('now'), datetime('now'));

-- Subcategories for Investment Income
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_income_dividends', 'Dividends', 'cat_income_investment', '#16A085', 'PiggyBank', 1, 1, datetime('now'), datetime('now')),
    ('cat_income_interest', 'Interest', 'cat_income_investment', '#16A085', 'Percent', 1, 2, datetime('now'), datetime('now')),
    ('cat_income_rental', 'Rental Income', 'cat_income_investment', '#16A085', 'Home', 1, 3, datetime('now'), datetime('now')),
    ('cat_income_capital_gains', 'Capital Gains', 'cat_income_investment', '#16A085', 'TrendingUp', 1, 4, datetime('now'), datetime('now'));

-- Subcategories for Other Income
INSERT INTO categories (id, name, parent_id, color, icon, is_income, sort_order, created_at, updated_at) VALUES
    ('cat_income_gifts', 'Gifts Received', 'cat_income_other', '#1ABC9C', 'Gift', 1, 1, datetime('now'), datetime('now')),
    ('cat_income_refunds', 'Refunds', 'cat_income_other', '#1ABC9C', 'RotateCcw', 1, 2, datetime('now'), datetime('now')),
    ('cat_income_reimbursements', 'Reimbursements', 'cat_income_other', '#1ABC9C', 'Receipt', 1, 3, datetime('now'), datetime('now')),
    ('cat_income_tax_refund', 'Tax Refund', 'cat_income_other', '#1ABC9C', 'FileText', 1, 4, datetime('now'), datetime('now'));

-- ============================================================================
-- PART 2: CATEGORY RULES
-- ============================================================================

-- Create category_rules table for auto-categorization based on transaction names
CREATE TABLE category_rules (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    match_type TEXT NOT NULL DEFAULT 'contains',  -- 'contains', 'starts_with', 'exact', 'regex'
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    sub_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_global INTEGER NOT NULL DEFAULT 1,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Create indexes for category_rules
CREATE INDEX idx_category_rules_priority ON category_rules(priority DESC);
CREATE INDEX idx_category_rules_category ON category_rules(category_id);
CREATE INDEX idx_category_rules_account ON category_rules(account_id);
CREATE INDEX idx_category_rules_is_global ON category_rules(is_global);

-- ============================================================================
-- PART 3: EVENT TYPES AND EVENTS
-- ============================================================================

-- Create event_types table for categorizing events (with color instead of sort_order)
CREATE TABLE event_types (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Create events table for tracking cash account activity events
CREATE TABLE events (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    event_type_id TEXT NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_dynamic_range INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Create indexes for events
CREATE INDEX idx_events_event_type ON events(event_type_id);
CREATE INDEX idx_events_dates ON events(start_date, end_date);

-- Insert default event types with colors
INSERT INTO event_types (id, name, color, created_at, updated_at) VALUES
    ('event-type-travel', 'Travel', '#3b82f6', datetime('now'), datetime('now')),
    ('event-type-holiday', 'Holiday', '#22c55e', datetime('now'), datetime('now')),
    ('event-type-business', 'Business', '#f97316', datetime('now'), datetime('now')),
    ('event-type-education', 'Education', '#8b5cf6', datetime('now'), datetime('now')),
    ('event-type-medical', 'Medical', '#ef4444', datetime('now'), datetime('now')),
    ('event-type-special-occasion', 'Special Occasion', '#ec4899', datetime('now'), datetime('now')),
    ('event-type-other', 'Other', '#6b7280', datetime('now'), datetime('now'));

-- ============================================================================
-- PART 4: ACTIVITIES TABLE EXTENSIONS
-- ============================================================================

-- Add new columns to activities table
ALTER TABLE activities ADD COLUMN name TEXT;
ALTER TABLE activities ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN sub_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN event_id TEXT REFERENCES events(id) ON DELETE SET NULL;

-- Create indexes for new activity columns
CREATE INDEX idx_activities_category_id ON activities(category_id);
CREATE INDEX idx_activities_sub_category_id ON activities(sub_category_id);
CREATE INDEX idx_activities_event ON activities(event_id);
