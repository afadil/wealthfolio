use crate::db;
use crate::models::{Asset, AssetProfile, NewAsset, Quote, QuoteSummary};
use crate::providers::yahoo_provider::YahooProvider;
use std::time::SystemTime;

use crate::schema::{activities, assets, quotes};
use chrono::{NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::SqliteConnection;
use std::collections::HashMap;

pub struct AssetService {
    provider: YahooProvider,
}

impl From<yahoo_finance_api::Quote> for Quote {
    fn from(external_quote: yahoo_finance_api::Quote) -> Self {
        Quote {
            id: uuid::Uuid::new_v4().to_string(), // Generate a new UUID for the id
            created_at: chrono::Utc::now().naive_utc(), // Use the current time for created_at
            data_source: String::from("Yahoo"),   // Replace with actual data source if available
            date: chrono::Utc::now().naive_utc(), // Adjust based on your requirements
            symbol: String::new(),                // Placeholder, needs actual symbol
            open: external_quote.open,
            high: external_quote.high,
            low: external_quote.low,
            volume: external_quote.volume as f64, // Convert from u64 to f64
            close: external_quote.close,
            adjclose: external_quote.adjclose,
        }
    }
}

impl AssetService {
    pub fn new() -> Self {
        AssetService {
            provider: YahooProvider::new().unwrap(),
        }
    }

    pub fn get_assets(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Asset>, diesel::result::Error> {
        assets::table.load::<Asset>(conn)
    }

    // get asset by id
    pub fn get_asset_by_id(
        &self,
        conn: &mut SqliteConnection,
        asset_id: &str,
    ) -> Result<Asset, diesel::result::Error> {
        assets::table
            .find(asset_id)
            .first::<Asset>(conn)
            .map_err(|e| e.into())
    }

    pub fn get_asset_data(
        &self,
        conn: &mut SqliteConnection,
        asset_id: &str,
    ) -> Result<AssetProfile, diesel::result::Error> {
        // Load Asset data
        let asset = assets::table
            .filter(assets::id.eq(asset_id))
            .first::<Asset>(conn)?;

        // Load Quote history for the Asset
        let quote_history = quotes::table
            .filter(quotes::symbol.eq(&asset.symbol))
            .order(quotes::date.desc())
            .load::<Quote>(conn)?;

        Ok(AssetProfile {
            asset,
            quote_history,
        })
    }

    pub fn load_currency_assets(
        &self,
        conn: &mut SqliteConnection,
        base_currency: &str,
    ) -> Result<Vec<Asset>, diesel::result::Error> {
        use crate::schema::assets::dsl::*;

        assets
            .filter(asset_type.eq("Currency"))
            .filter(symbol.like(format!("{}%", base_currency)))
            .load::<Asset>(conn)
    }

    pub fn load_exchange_rates(
        &self,
        conn: &mut SqliteConnection,
        base_currency: &str,
    ) -> Result<HashMap<String, f64>, diesel::result::Error> {
        use crate::schema::quotes::dsl::{date, quotes, symbol};

        let mut exchange_rates = HashMap::new();

        let currency_assets = self.load_currency_assets(conn, base_currency)?;

        for asset in currency_assets {
            let latest_quote = quotes
                .filter(symbol.eq(&asset.symbol))
                .order(date.desc())
                .first::<Quote>(conn)
                .ok();

            if let Some(quote) = latest_quote {
                exchange_rates.insert(asset.symbol, quote.close);
            }
        }

        Ok(exchange_rates)
    }

    // create CASH asset
    pub fn create_cash_asset(
        &self,
        conn: &mut SqliteConnection,
        currency: &str,
    ) -> Result<Asset, diesel::result::Error> {
        let asset_id = format!("$CASH-{}", currency);

        let new_asset = NewAsset {
            id: asset_id.to_string(),
            isin: None,
            name: None,
            asset_type: None,
            symbol: asset_id.to_string(),
            symbol_mapping: None,
            asset_class: Some("CASH".to_string()),
            asset_sub_class: Some("CASH".to_string()),
            comment: None,
            countries: None,
            categories: None,
            classes: None,
            attributes: None,
            currency: currency.to_string(),
            data_source: "MANUAL".to_string(),
            sectors: None,
            url: None,
        };

        diesel::insert_into(assets::table)
            .values(&new_asset)
            .get_result::<Asset>(conn) // This line changed
    }

    // create Rate exchange asset
    pub fn create_rate_exchange_asset(
        &self,
        conn: &mut SqliteConnection,
        base_currency: &str,
        target_currency: &str,
    ) -> Result<Asset, diesel::result::Error> {
        let asset_id = format!("{}{}=X", base_currency, target_currency);

        let new_asset = NewAsset {
            id: asset_id.to_string(),
            isin: None,
            name: None,
            asset_type: Some("Currency".to_string()),
            symbol: asset_id.to_string(),
            symbol_mapping: None,
            asset_class: Some("CASH".to_string()),
            asset_sub_class: Some("CASH".to_string()),
            comment: None,
            countries: None,
            categories: None,
            classes: None,
            attributes: None,
            currency: base_currency.to_string(),
            data_source: "MANUAL".to_string(),
            sectors: None,
            url: None,
        };

        diesel::insert_into(assets::table)
            .values(&new_asset)
            .get_result::<Asset>(conn) // This line changed
    }

    // pub async fn fetch_quote(&self, symbol: &str) -> Result<Quote, String> {
    //     self.provider
    //         .get_latest_quote(symbol)
    //         .await
    //         .map_err(|e| e.to_string())
    //         .map(|external_quote| Quote::from(external_quote)) // Converts ExternalQuote to Quote
    // }

    pub fn get_latest_quote(
        &self,
        conn: &mut SqliteConnection,
        symbol_query: &str,
    ) -> QueryResult<Quote> {
        use crate::schema::quotes::dsl::*;

        quotes
            .filter(symbol.eq(symbol_query))
            .order(date.desc()) // Order by date descending to get the latest quote in the table
            .first::<Quote>(conn)
    }

    pub fn get_history_quotes(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Quote>, diesel::result::Error> {
        quotes::table.load::<Quote>(conn)
    }

    pub async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, String> {
        self.provider
            .search_ticker(query)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn initialize_crumb_data(&self) -> Result<(), String> {
        match self.provider.set_crumb().await {
            Ok(_) => {
                println!("Crumb data initialized successfully.");
                Ok(())
            }
            Err(e) => {
                let error_message = format!("Failed to initialize crumb data: {}", e);
                eprintln!("{}", &error_message);
                Err(error_message)
            }
        }
    }

    pub async fn get_asset_profile(
        &self,
        conn: &mut SqliteConnection,
        asset_id: &str,
    ) -> Result<Asset, diesel::result::Error> {
        use crate::schema::assets::dsl::*;
        // Try to load the Asset from the database
        match assets.find(asset_id).first::<Asset>(conn) {
            Ok(existing_profile) => Ok(existing_profile),
            Err(diesel::NotFound) => {
                // If not found, fetch one and save it to the database
                let fetched_profile = self
                    .provider
                    .fetch_quote_summary(asset_id)
                    .await
                    .map_err(|_e| diesel::result::Error::NotFound)?;

                // Insert the new profile into the database
                diesel::insert_into(assets)
                    .values(&fetched_profile)
                    .returning(Asset::as_returning())
                    .get_result(conn)
                    .map_err(|e| e.into())
            }
            Err(e) => Err(e),
        }
    }

    fn get_last_quote_sync_date(
        &self,
        conn: &mut SqliteConnection,
        ticker: &str,
    ) -> Result<Option<NaiveDateTime>, diesel::result::Error> {
        // Try to get the latest quote date for the given ticker
        let latest_quote_date = quotes::table
            .filter(quotes::symbol.eq(ticker))
            .select(diesel::dsl::max(quotes::date))
            .first::<Option<NaiveDateTime>>(conn)?;

        // Check if latest_quote_date is Some and return early
        if let Some(date) = latest_quote_date {
            return Ok(Some(date));
        }

        // The code reaches here only if latest_quote_date is None
        let earliest_activity_date = activities::table
            .filter(activities::asset_id.eq(ticker))
            .select(diesel::dsl::min(activities::activity_date))
            .first::<Option<NaiveDateTime>>(conn)?;

        Ok(earliest_activity_date)
    }

    pub async fn sync_history_quotes_for_all_assets(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<(), String> {
        println!("Syncing history quotes for all assets...");

        // 1. Query all assets
        let asset_list = Self::get_assets(self, conn).map_err(|e| e.to_string())?;

        // 2. Determine your end date for fetching historical quotes (e.g., current time)
        let end_date = SystemTime::now();

        // 3. Create a Vec to store quotes for all assets
        let mut all_quotes_to_insert = Vec::new();

        for asset in asset_list {
            let symbol = asset.symbol.as_str();
            // Get the last quote sync date for this asset
            let last_sync_date_naive = match self.get_last_quote_sync_date(conn, symbol) {
                Ok(date) => date.unwrap_or_else(|| {
                    chrono::Utc::now().naive_utc() - chrono::Duration::days(3 * 365)
                }),
                Err(e) => {
                    eprintln!(
                        "Error getting last sync date for {}: {}. Skipping.",
                        symbol, e
                    );
                    continue;
                }
            };

            // Convert NaiveDateTime to DateTime<Utc>
            let start_datetime_utc = Utc.from_utc_datetime(&last_sync_date_naive);

            // Convert DateTime<Utc> to SystemTime
            let start_date: std::time::SystemTime = start_datetime_utc.into();

            // Fetch quotes for the asset and append them to the all_quotes_to_insert Vec
            match self
                .provider
                .fetch_stock_history(symbol, start_date, end_date)
                .await
            {
                Ok(quotes_history) => {
                    for yahoo_quote in quotes_history {
                        let timestamp = yahoo_quote.timestamp as i64;
                        match chrono::DateTime::from_timestamp(timestamp, 0) {
                            Some(datetime) => {
                                let naive_datetime = datetime.naive_utc();
                                let new_quote = Quote {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    created_at: naive_datetime,
                                    data_source: "YAHOO".to_string(),
                                    date: naive_datetime,
                                    symbol: symbol.to_string(),
                                    open: yahoo_quote.open,
                                    high: yahoo_quote.high,
                                    low: yahoo_quote.low,
                                    volume: yahoo_quote.volume as f64,
                                    close: yahoo_quote.close,
                                    adjclose: yahoo_quote.adjclose,
                                };
                                all_quotes_to_insert.push(new_quote);
                            }
                            None => eprintln!(
                                "Invalid timestamp {} for {}. Skipping quote.",
                                timestamp, symbol
                            ),
                        }
                    }
                }
                Err(e) => eprintln!("Error fetching history for {}: {}. Skipping.", symbol, e),
            }
        }

        // 4. Use Diesel's batch insert to insert all quotes in a single operation
        diesel::replace_into(quotes::table)
            .values(&all_quotes_to_insert)
            .execute(conn)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn initialize_and_sync_quotes(&self) -> Result<(), String> {
        // Initialize crumb data
        if let Err(e) = self.initialize_crumb_data().await {
            return Err(format!("Failed to initialize crumb data: {}", e));
        }

        let mut conn = db::establish_connection();

        // Synchronize history quotes
        if let Err(e) = self.sync_history_quotes_for_all_assets(&mut conn).await {
            return Err(format!("Failed to sync history quotes: {}", e));
        }

        Ok(())
    }
}

// }
