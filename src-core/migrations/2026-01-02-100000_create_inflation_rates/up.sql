CREATE TABLE inflation_rates (
    id TEXT PRIMARY KEY NOT NULL,
    country_code TEXT NOT NULL,
    year INTEGER NOT NULL,
    rate NUMERIC NOT NULL,
    reference_date TEXT,
    data_source TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(country_code, year)
);

CREATE INDEX idx_inflation_rates_country_year ON inflation_rates(country_code, year);
