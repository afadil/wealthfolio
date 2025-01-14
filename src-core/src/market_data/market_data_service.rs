use crate::models::{Activity, Asset, ExchangeRate, NewAsset, Quote, QuoteSummary, QuoteUpdate};
use crate::providers::market_data_factory::MarketDataFactory;
use crate::providers::market_data_provider::{
    MarketDataError, MarketDataProvider, MarketDataProviderType,
};
use crate::schema::{activities, exchange_rates, quotes};
use chrono::{Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::SqliteConnection;
use log::{debug, error};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;

pub struct MarketDataService {
    public_data_provider: Arc<dyn MarketDataProvider>,
    private_data_provider: Arc<dyn MarketDataProvider>,
}

impl MarketDataService {
    pub async fn new() -> Self {
        MarketDataService {
            public_data_provider: MarketDataFactory::get_provider(MarketDataProviderType::Yahoo)
                .await,
            private_data_provider: MarketDataFactory::get_provider(MarketDataProviderType::Manual)
                .await,
        }
    }

    pub async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        self.public_data_provider.search_ticker(query).await
    }

    pub fn get_latest_quote(
        &self,
        conn: &mut SqliteConnection,
        symbol: &str,
    ) -> QueryResult<Quote> {
        quotes::table
            .filter(quotes::symbol.eq(symbol))
            .order(quotes::date.desc())
            .first::<Quote>(conn)
    }

    pub fn load_quotes(&self, conn: &mut SqliteConnection) -> HashMap<(String, NaiveDate), Quote> {
        let quotes_result: QueryResult<Vec<Quote>> = quotes::table.load::<Quote>(conn);

        match quotes_result {
            Ok(quotes) => quotes
                .into_iter()
                .map(|quote| {
                    let quote_date = quote.date.date();
                    ((quote.symbol.clone(), quote_date), quote)
                })
                .collect(),
            Err(e) => {
                error!("Error loading quotes: {}", e);
                HashMap::new()
            }
        }
    }

    pub async fn sync_asset_quotes(
        &self,
        conn: &mut SqliteConnection,
        asset_list: &Vec<Asset>,
    ) -> Result<(), String> {
        debug!("Syncing history quotes for assets...");
        let end_date = SystemTime::now();
        let mut all_quotes_to_insert = Vec::new();
        let mut failed_assets = Vec::new();

        for asset in asset_list {
            let quotes_result = match asset.data_source.as_str() {
                "Yahoo" => self.sync_public_asset_quotes(conn, asset, end_date).await,
                "MANUAL" => self.sync_private_asset_quotes(conn, asset).await,
                _ => continue,
            };

            match quotes_result {
                Ok(quotes) => all_quotes_to_insert.extend(quotes),
                Err(e) => {
                    error!("Failed to sync quotes for asset {}: {}", asset.symbol, e);
                    failed_assets.push((asset.symbol.clone(), e));
                    continue;
                }
            }
        }

        // Insert all successfully fetched quotes
        if !all_quotes_to_insert.is_empty() {
            if let Err(e) = self.insert_quotes(conn, &all_quotes_to_insert) {
                error!("Failed to insert quotes: {}", e);
                return Err(format!(
                    "Failed to insert quotes. Additionally, failed assets: {:?}",
                    failed_assets
                ));
            }
        }

        // If we had any failures, return them as part of the error message
        if !failed_assets.is_empty() {
            return Err(format!(
                "Sync completed with errors for the following assets: {:?}",
                failed_assets
            ));
        }

        Ok(())
    }

    async fn sync_private_asset_quotes(
        &self,
        conn: &mut SqliteConnection,
        asset: &Asset,
    ) -> Result<Vec<Quote>, String> {
        // Load activities for the asset
        let activities = activities::table
            .filter(activities::asset_id.eq(asset.symbol.as_str()))
            .order(activities::activity_date.asc())
            .load::<Activity>(conn)
            .map_err(|e| format!("Failed to load activities for {}: {}", asset.symbol, e))?;

        if activities.is_empty() {
            debug!("No activities found for asset {}", asset.symbol);
            return Ok(Vec::new());
        }

        let today = Utc::now().naive_utc().date();
        let first_activity_date = activities[0].activity_date.date();
        let capacity = (today - first_activity_date).num_days() as usize + 1;
        let mut quotes = Vec::with_capacity(capacity);

        // Create an iterator over activity dates and prices
        let mut activity_changes: Vec<(NaiveDate, f64)> = activities
            .iter()
            .map(|activity| (activity.activity_date.date(), activity.unit_price))
            .collect();
        activity_changes.push((today, activity_changes.last().unwrap().1));

        // Generate quotes for each day between activities
        for window in activity_changes.windows(2) {
            let (current_date, current_price) = window[0];
            let next_date = window[1].0;
            let mut date = current_date;

            while date <= next_date {
                quotes.push(Quote {
                    id: format!("{}_{}", date.format("%Y%m%d"), asset.symbol),
                    symbol: asset.symbol.clone(),
                    date: date.and_hms_opt(2, 0, 0).unwrap(),
                    open: current_price,
                    high: current_price,
                    low: current_price,
                    close: current_price,
                    adjclose: current_price,
                    volume: 0.0, // Set to 0 since volume isn't meaningful for manual quotes
                    data_source: "MANUAL".to_string(),
                    created_at: Utc::now().naive_utc(),
                });
                date += Duration::days(1);
            }
        }

        debug!(
            "Generated {} quotes for asset {}",
            quotes.len(),
            asset.symbol
        );
        Ok(quotes)
    }

    async fn sync_public_asset_quotes(
        &self,
        conn: &mut SqliteConnection,
        asset: &Asset,
        end_date: SystemTime,
    ) -> Result<Vec<Quote>, String> {
        let symbol = asset.symbol.clone();
        let last_sync_date = self
            .get_last_quote_sync_date(conn, symbol.as_str())
            .map_err(|e| {
                format!(
                    "Error getting last sync date for {}: {}",
                    symbol.as_str(),
                    e
                )
            })?;

        let start_date: SystemTime = Utc
            .from_utc_datetime(&(last_sync_date - Duration::days(1)))
            .into();

        match self
            .public_data_provider
            .get_stock_history(&asset.symbol, start_date, end_date)
            .await
        {
            Ok(quotes) => return Ok(quotes),
            Err(e) => Err(format!("Failed to fetch quotes for {}: {}", symbol, e)),
        }
    }

    fn get_last_quote_sync_date(
        &self,
        conn: &mut SqliteConnection,
        ticker: &str,
    ) -> Result<NaiveDateTime, diesel::result::Error> {
        let five_years_ago = Utc::now().naive_utc() - Duration::days(5 * 365);

        // First try to get the most recent quote
        let last_quote_date = quotes::table
            .filter(quotes::symbol.eq(ticker))
            .select(diesel::dsl::max(quotes::date))
            .first::<Option<NaiveDateTime>>(conn)?;

        if let Some(date) = last_quote_date {
            return Ok(date);
        }

        // If no quotes, try to get first activity date only if it's older than 5 years
        let first_activity_date = activities::table
            .filter(activities::asset_id.eq(ticker))
            .select(diesel::dsl::min(activities::activity_date))
            .first::<Option<NaiveDateTime>>(conn)?;

        Ok(first_activity_date
            .filter(|date| *date < five_years_ago)
            .unwrap_or(five_years_ago))
    }

    fn insert_quotes(&self, conn: &mut SqliteConnection, quotes: &[Quote]) -> Result<(), String> {
        diesel::replace_into(quotes::table)
            .values(quotes)
            .execute(conn)
            .map_err(|e| format!("Failed to insert quotes: {}", e))?;
        Ok(())
    }

    pub async fn initialize_and_sync_quotes(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<(), String> {
        use crate::schema::assets::dsl::*;

        let asset_list: Vec<Asset> = assets
            .load::<Asset>(conn)
            .map_err(|e| format!("Failed to load assets: {}", e))?;

        match self.sync_asset_quotes(conn, &asset_list).await {
            Ok(_) => {}
            Err(e) => {
                error!("Failed to sync asset quotes: {}", e);
            }
        };

        Ok(())
    }

    pub async fn get_symbol_profile(&self, symbol: &str) -> Result<NewAsset, String> {
        match self.public_data_provider.get_symbol_profile(symbol).await {
            Ok(asset) => Ok(asset),
            Err(_) => self
                .private_data_provider
                .get_symbol_profile(symbol)
                .await
                .map_err(|e| format!("Failed to get symbol profile for {}: {}", symbol, e)),
        }
    }

    pub fn get_asset_currencies(
        &self,
        conn: &mut SqliteConnection,
        asset_ids: Vec<String>,
    ) -> HashMap<String, String> {
        use crate::schema::assets::dsl::*;

        assets
            .filter(id.eq_any(asset_ids))
            .select((id, currency))
            .load::<(String, String)>(conn)
            .map(|results| results.into_iter().collect::<HashMap<_, _>>())
            .unwrap_or_else(|e| {
                error!("Error fetching asset currencies: {}", e);
                HashMap::new()
            })
    }

    pub async fn sync_exchange_rates(&self, conn: &mut SqliteConnection) -> Result<(), String> {
        debug!("Syncing exchange rates...");

        // Load existing exchange rates
        let existing_rates: Vec<ExchangeRate> = exchange_rates::table
            .load::<ExchangeRate>(conn)
            .map_err(|e| format!("Failed to load existing exchange rates: {}", e))?;

        let mut updated_rates = Vec::new();

        for rate in existing_rates {
            match self
                .get_exchange_rate(&rate.from_currency, &rate.to_currency)
                .await
            {
                Ok(new_rate) => {
                    if new_rate > 0.0 {
                        updated_rates.push(ExchangeRate {
                            id: rate.id,
                            from_currency: rate.from_currency,
                            to_currency: rate.to_currency,
                            rate: new_rate,
                            source: rate.source,
                            created_at: rate.created_at,
                            updated_at: Utc::now().naive_utc(),
                        });
                    }
                }
                Err(e) => {
                    error!(
                        "Failed to fetch rate for {}-{}: {}. Skipping update.",
                        rate.from_currency, rate.to_currency, e
                    );
                }
            }
        }

        // Update rates in the database
        diesel::replace_into(exchange_rates::table)
            .values(&updated_rates)
            .execute(conn)
            .map_err(|e| format!("Failed to update exchange rates: {}", e))?;

        Ok(())
    }

    async fn get_exchange_rate(&self, from: &str, to: &str) -> Result<f64, String> {
        // Handle GBP and GBp case manually
        if from != from.to_uppercase() || to != to.to_uppercase() {
            return Ok(-1.0);
        }
        if from == to {
            return Ok(1.0);
        }

        // Try direct conversion
        let symbol = format!("{}{}=X", from, to);
        if let Ok(quote) = self.public_data_provider.get_latest_quote(&symbol).await {
            return Ok(quote.close);
        }

        // Try reverse conversion
        let reverse_symbol = format!("{}{}=X", to, from);
        if let Ok(quote) = self
            .public_data_provider
            .get_latest_quote(&reverse_symbol)
            .await
        {
            return Ok(1.0 / quote.close);
        }

        // Try conversion through USD
        let from_usd_symbol = if from != "USD" {
            format!("{}USD=X", from)
        } else {
            "".to_string()
        };

        let to_usd_symbol = if to != "USD" {
            format!("{}USD=X", to)
        } else {
            "".to_string()
        };
        let from_usd = if !from_usd_symbol.is_empty() {
            match self
                .public_data_provider
                .get_latest_quote(&from_usd_symbol)
                .await
            {
                Ok(quote) => quote.close,
                Err(_) => return Ok(-1.0),
            }
        } else {
            -1.0
        };

        let to_usd = if !to_usd_symbol.is_empty() {
            match self
                .public_data_provider
                .get_latest_quote(&to_usd_symbol)
                .await
            {
                Ok(quote) => quote.close,
                Err(_) => return Ok(-1.0),
            }
        } else {
            1.0
        };

        Ok(from_usd / to_usd)
    }

    pub fn get_quote_history(
        &self,
        conn: &mut SqliteConnection,
        a_symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>, diesel::result::Error> {
        use crate::schema::quotes::dsl::*;

        quotes
            .filter(symbol.eq(a_symbol))
            .filter(date.ge(start_date.and_hms_opt(0, 0, 0).unwrap()))
            .filter(date.le(end_date.and_hms_opt(23, 59, 59).unwrap()))
            .order(date.asc())
            .load::<Quote>(conn)
    }

    pub async fn refresh_quotes_for_symbols(
        &self,
        conn: &mut SqliteConnection,
        symbols: &[String],
    ) -> Result<(), String> {
        debug!("Refreshing quotes for {} symbols", symbols.len());

        use crate::schema::quotes;
        diesel::delete(quotes::table)
            .filter(quotes::symbol.eq_any(symbols))
            .execute(conn)
            .map_err(|e| format!("Failed to delete existing quotes: {}", e))?;

        // Load assets for the given symbols
        use crate::schema::assets::dsl::*;
        let asset_list: Vec<Asset> = assets
            .filter(crate::schema::assets::symbol.eq_any(symbols))
            .load::<Asset>(conn)
            .map_err(|e| format!("Failed to load assets: {}", e))?;

        // Sync quotes for these assets
        self.sync_asset_quotes(conn, &asset_list).await
    }

    pub async fn get_symbol_history_from_provider(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>, String> {
        debug!(
            "Getting symbol history for {} from {} to {}",
            symbol, start_date, end_date
        );
        let start_time: SystemTime = Utc
            .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap())
            .into();
        let end_time: SystemTime = Utc
            .from_utc_datetime(&end_date.and_hms_opt(23, 59, 59).unwrap())
            .into();

        // Try to get data from public provider first
        match self
            .public_data_provider
            .get_stock_history(symbol, start_time, end_time)
            .await
        {
            Ok(quotes) => Ok(quotes),
            Err(MarketDataError::NotFound(_)) => {
                // If not found in public provider, try private provider
                self.private_data_provider
                    .get_stock_history(symbol, start_time, end_time)
                    .await
                    .map_err(|e| format!("Failed to fetch history for {}: {}", symbol, e))
            }
            Err(e) => Err(format!("Failed to fetch history for {}: {}", symbol, e)),
        }
    }

    pub fn update_quote(
        &self,
        conn: &mut SqliteConnection,
        quote_update: QuoteUpdate,
    ) -> Result<(), String> {
        use crate::schema::quotes;

        // Convert the date string to NaiveDateTime
        let date = NaiveDateTime::parse_from_str(
            &format!("{} 00:00:00", quote_update.date),
            "%Y-%m-%d %H:%M:%S",
        )
        .map_err(|e| format!("Failed to parse date: {}", e))?;

        // Create a new Quote from QuoteUpdate
        let quote = Quote {
            id: format!(
                "{}_{}",
                quote_update.date.replace("-", ""),
                quote_update.symbol
            ),
            created_at: chrono::Utc::now().naive_utc(),
            data_source: "MANUAL".to_string(),
            date,
            symbol: quote_update.symbol,
            open: quote_update.open,
            high: quote_update.high,
            low: quote_update.low,
            volume: quote_update.volume,
            close: quote_update.close,
            adjclose: quote_update.close, // Set adjclose equal to close for manual quotes
        };

        diesel::replace_into(quotes::table)
            .values(&quote)
            .execute(conn)
            .map_err(|e| format!("Failed to update quote: {}", e))?;

        Ok(())
    }

    pub fn delete_quote(&self, conn: &mut SqliteConnection, quote_id: &str) -> Result<(), String> {
        use crate::schema::quotes::dsl::*;

        diesel::delete(quotes.filter(id.eq(quote_id)))
            .execute(conn)
            .map_err(|e| format!("Failed to delete quote: {}", e))?;

        Ok(())
    }
}
