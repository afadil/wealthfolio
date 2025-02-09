use crate::models::{Activity, Asset, NewAsset, Quote, QuoteSummary, QuoteUpdate};
use crate::providers::market_data_factory::MarketDataFactory;
use crate::providers::market_data_provider::{
    AssetProfiler, MarketDataError, MarketDataProvider,
};
use crate::schema::{activities, quotes};
use chrono::{Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::SqliteConnection;
use log::{debug, error, info};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;

pub struct MarketDataService {
    public_data_provider: Arc<dyn MarketDataProvider>,
    private_asset_profiler: Arc<dyn AssetProfiler>,
}

impl MarketDataService {
    pub async fn new() -> Self {
        MarketDataService {
            public_data_provider: MarketDataFactory::get_public_data_provider()
                .await,
            private_asset_profiler: MarketDataFactory::get_private_asset_profiler()
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

    pub fn load_quotes(&self, conn: &mut SqliteConnection) -> HashMap<String, Vec<(NaiveDate, Quote)>> {
        let quotes_result: QueryResult<Vec<Quote>> = quotes::table.load::<Quote>(conn);

        let mut quotes_map: HashMap<String, Vec<(NaiveDate, Quote)>> = HashMap::new();

        match quotes_result {
            Ok(quotes) => {
                for quote in quotes {
                    let quote_date = quote.date.date();
                    quotes_map
                        .entry(quote.symbol.clone())
                        .or_insert_with(Vec::new)
                        .push((quote_date, quote));
                }

                for symbol_quotes in quotes_map.values_mut() {
                    symbol_quotes.sort_by(|a, b| b.0.cmp(&a.0)); // Sort quote dates in descending order
                }
            }
            Err(e) => {
                error!("Error loading quotes: {}", e);
            }
        }

        quotes_map
    }

    pub async fn sync_asset_quotes(
        &self,
        conn: &mut SqliteConnection,
        asset_list: &Vec<Asset>,
    ) -> Result<(), String> {
        info!("Syncing history quotes for assets...");
        let end_date = SystemTime::now();

        // Group assets by data source
        let (manual_assets, public_assets): (Vec<_>, Vec<_>) = asset_list
            .iter()
            .cloned()
            .partition(|asset| asset.data_source == "MANUAL");

        let mut all_quotes = Vec::new();
        let mut failed_assets = Vec::new();

        // Process manual assets sequentially since they need database access
        for asset in manual_assets {
            match self.sync_private_asset_quotes(conn, &asset).await {
                Ok(quotes) => all_quotes.extend(quotes),
                Err(e) => {
                    error!("Failed to sync manual quotes for asset {}: {}", asset.symbol, e);
                    failed_assets.push((asset.symbol, e));
                }
            }
        }

        // Extract symbols for public assets
        let public_symbols: Vec<String> = public_assets.iter().map(|asset| asset.symbol.clone()).collect();

        // Fetch all public asset quotes in parallel if there are any
        if !public_symbols.is_empty() {
            // Get the start date for fetching (using the first symbol as reference)
            let start_date = match self.get_last_quote_sync_date(conn, &public_symbols[0]) {
                Ok(last_sync_date) => {
                    Utc.from_utc_datetime(&(last_sync_date - Duration::days(1))).into()
                }
                Err(e) => {
                    error!("Failed to get last sync date: {}", e);
                    return Err(format!("Failed to get last sync date: {}", e));
                }
            };

            // Fetch quotes for all public assets in parallel
            match self.public_data_provider
                .get_stock_history_bulk(&public_symbols, start_date, end_date)
                .await
            {
                Ok(quotes) => all_quotes.extend(quotes),
                Err(e) => {
                    error!("Failed to sync public quotes batch: {}", e);
                    for symbol in public_symbols {
                        failed_assets.push((symbol, e.to_string()));
                    }
                }
            }
        }

        // Insert all successfully fetched quotes in batches
        if !all_quotes.is_empty() {
            const BATCH_SIZE: usize = 1000;
            for chunk in all_quotes.chunks(BATCH_SIZE) {
                if let Err(e) = self.insert_quotes(conn, chunk) {
                    error!("Failed to insert quotes batch: {}", e);
                    return Err(format!(
                        "Failed to insert quotes. Additionally, failed assets: {:?}",
                        failed_assets
                    ));
                }
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

        // Load manual quotes for the asset, which can override activity prices
        let mut manual_quotes = quotes::table
            .filter(quotes::symbol.eq(asset.symbol.as_str()))
            .filter(quotes::data_source.eq("MANUAL"))
            .order(quotes::date.asc())
            .load::<Quote>(conn)
            .map_err(|e| format!("Failed to load manual quotes for {}: {}", asset.symbol, e))?;

        // Pop the next manual quote from the list for checking against activity dates and prices
        let mut next_manual_quote = manual_quotes.pop();

        // Generate quotes for each day between activities
        for window in activity_changes.windows(2) {
            let (current_date, mut current_price) = window[0];
            let next_date = window[1].0;
            let mut date = current_date;

            while date <= next_date {
                // Check if we have a manual quote for this date, and if so:
                // 1. Don't add another quote
                // 2. Update the current price for future quotes in this window
                // 3. Pop the next manual quote
                match next_manual_quote {
                    Some(quote) if quote.date.date() == date => {
                        quotes.push(quote.clone());
                        current_price = quote.close;
                        next_manual_quote = manual_quotes.pop();
                    }
                    // Otherwise, fabricate a quote based on the current price
                    _ => {
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
                            data_source: "CALCULATED".to_string(),
                            created_at: Utc::now().naive_utc(),
                        });
                    }
                }
                // Move to the next date
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


    fn get_last_quote_sync_date(
        &self,
        conn: &mut SqliteConnection,
        ticker: &str,
    ) -> Result<NaiveDateTime, diesel::result::Error> {
        let five_years_ago = Utc::now().naive_utc() - Duration::days(10 * 365);

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

    pub async fn get_asset_info(&self, symbol: &str) -> Result<NewAsset, String> {
        // Assume the asset is public and try to get the profile
        match self.public_data_provider.get_symbol_profile(symbol).await {
            Ok(asset) => Ok(asset),
            // Build a manual asset profile if the public provider fails
            Err(_) => self
                .private_asset_profiler
                .get_asset_profile(symbol)
                .await
                .map_err(|e| format!("Failed to get symbol profile for {}: {}", symbol, e)),
        }
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

        // Determine the data source
        let data_source = if quote_update.data_source.is_empty() {
            "MANUAL".to_string()
        } else {
            quote_update.data_source.clone()
        };

        // Create a new Quote from QuoteUpdate
        let quote = Quote {
            id: format!(
                "{}_{}",
                quote_update.date.replace("-", ""),
                quote_update.symbol
            ),
            created_at: chrono::Utc::now().naive_utc(),
            data_source,
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

    pub fn get_latest_quotes(
        &self,
        conn: &mut SqliteConnection,
        symbols: &[String],
    ) -> QueryResult<HashMap<String, Quote>> {
        let quotes = quotes::table
            .filter(quotes::symbol.eq_any(symbols))
            .order_by((quotes::symbol.asc(), quotes::date.desc()))
            .load::<Quote>(conn)?;

        // Group by symbol and take the latest quote for each
        let mut latest_quotes = HashMap::new();
        for quote in quotes {
            latest_quotes.entry(quote.symbol.clone()).or_insert(quote);
        }

        Ok(latest_quotes)
    }

    pub fn get_asset_currencies(
        &self,
        conn: &mut SqliteConnection,
    ) -> HashMap<String, String> {
        use crate::schema::assets::dsl::*;

        let asset_currencies: Vec<(String, String)> = assets
            .select((symbol, currency))
            .load::<(String, String)>(conn)
            .unwrap_or_default();

        asset_currencies.into_iter().collect()
    }
}
