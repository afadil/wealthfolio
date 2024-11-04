use crate::models::{Activity, Asset, ExchangeRate, NewAsset, Quote, QuoteSummary};
use crate::providers::market_data_factory::MarketDataFactory;
use crate::providers::market_data_provider::{MarketDataError, MarketDataProvider, MarketDataProviderType};
use crate::schema::{activities, exchange_rates, quotes};
use chrono::{Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::SqliteConnection;
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
            public_data_provider: MarketDataFactory::get_provider(MarketDataProviderType::Yahoo).await,
            private_data_provider: MarketDataFactory::get_provider(MarketDataProviderType::Private).await,
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
                eprintln!("Error loading quotes: {}", e);
                HashMap::new()
            }
        }
    }

    pub async fn sync_asset_quotes(
        &self,
        conn: &mut SqliteConnection,
        asset_list: &Vec<Asset>,
    ) -> Result<(), String> {
        println!("Syncing history quotes for assets...");
        let end_date = SystemTime::now();
        let mut all_quotes_to_insert = Vec::new();

        for asset in asset_list {
            match asset.data_source.as_str() {
                "CASH" => continue,
                "Yahoo" => {
                    let quotes =  self.sync_public_asset_quotes(conn, asset, end_date).await?;
                    all_quotes_to_insert.extend(quotes)
                }
                "Private" => {
                    let quotes = self.sync_private_asset_quotes(conn, asset).await?;
                    all_quotes_to_insert.extend(quotes)
                }
                _ => continue,
            }
        }

        self.insert_quotes(conn, &all_quotes_to_insert)
    }

    async fn sync_private_asset_quotes(
        &self,
        conn: &mut SqliteConnection,
        asset: &Asset,
    ) -> Result<Vec<Quote>, String> {
        let activities = activities::table
                        .filter(activities::asset_id.eq(asset.symbol.as_str()))
                        .order(activities::activity_date.asc())
                        .load::<Activity>(conn)
                        .map_err(|e| format!("Failed to load activities for {}: {}", asset.symbol, e))?;

        let mut quotes = Vec::new();
        if activities.is_empty() {
            return Ok(quotes);
        }

        let mut activity_iter = activities.iter().peekable();
        let mut current_activity = activity_iter.next().unwrap();
        let mut current_date = current_activity.activity_date.date();

        while let Some(next_activity) = activity_iter.peek() {
            let next_date = next_activity.activity_date.date();

            while current_date < next_date {
            let quote = Quote {
                id: format!("{}_{}", current_date.format("%Y%m%d"), asset.symbol),
                symbol: asset.symbol.clone(),
                date: current_date.and_hms_opt(2, 0, 0).unwrap(),
                open: current_activity.unit_price,
                high: current_activity.unit_price,
                low: current_activity.unit_price,
                close: current_activity.unit_price,
                adjclose: current_activity.unit_price,
                volume: current_activity.quantity,
                data_source: "Private".to_string(),
                created_at: Utc::now().naive_utc(),
            };
            quotes.push(quote);
            current_date += Duration::days(1);
            }

            current_activity = activity_iter.next().unwrap();
        }

        // Add quotes for remaining days up to the last activity date
        while current_date <= current_activity.activity_date.date() {
            let quote = Quote {
                id: format!("{}_{}", current_date.format("%Y%m%d"), asset.symbol),
                symbol: asset.symbol.clone(),
                date: current_date.and_hms_opt(2, 0, 0).unwrap(),
                open: current_activity.unit_price,
                high: current_activity.unit_price,
                low: current_activity.unit_price,
                close: current_activity.unit_price,
                adjclose: current_activity.unit_price,
                volume: current_activity.quantity,
                data_source: "Private".to_string(),
                created_at: Utc::now().naive_utc(),
            };
            quotes.push(quote);
            current_date += Duration::days(1);
        }

        // Add quotes for remaining days from the last activity date to the current date
        let today = Utc::now().naive_utc().date();
        while current_date <= today {
            let quote = Quote {
                id: format!("{}_{}", current_date.format("%Y%m%d"), asset.symbol),
                symbol: asset.symbol.clone(),
                date: current_date.and_hms_opt(2, 0, 0).unwrap(),
                open: current_activity.unit_price,
                high: current_activity.unit_price,
                low: current_activity.unit_price,
                close: current_activity.unit_price,
                adjclose: current_activity.unit_price,
                volume: current_activity.quantity,
                data_source: "Private".to_string(),
                created_at: Utc::now().naive_utc(),
            };
            quotes.push(quote);
            current_date += Duration::days(1);
        }

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
            .map_err(|e| format!("Error getting last sync date for {}: {}", symbol.as_str(), e))?
            .unwrap_or_else(|| Utc::now().naive_utc() - Duration::days(3 * 365));

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
    ) -> Result<Option<NaiveDateTime>, diesel::result::Error> {
        quotes::table
            .filter(quotes::symbol.eq(ticker))
            .select(diesel::dsl::max(quotes::date))
            .first::<Option<NaiveDateTime>>(conn)
            .or_else(|_| {
                activities::table
                    .filter(activities::asset_id.eq(ticker))
                    .select(diesel::dsl::min(activities::activity_date))
                    .first::<Option<NaiveDateTime>>(conn)
            })
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

        match self.sync_asset_quotes(conn, &asset_list).await{
            Ok(_) => {},
            Err(e) => {
                eprintln!("Failed to sync asset quotes: {}", e);
            }
        };

        Ok(())
    }

    pub async fn get_symbol_profile(&self, symbol: &str) -> Result<NewAsset, String> {
        match self.public_data_provider
            .get_symbol_profile(symbol)
            .await{
                Ok(asset) => Ok(asset),
                Err(_) => {
                    self.private_data_provider
                        .get_symbol_profile(symbol)
                        .await
                        .map_err(|e| format!("Failed to get symbol profile for {}: {}", symbol, e))
                },
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
                eprintln!("Error fetching asset currencies: {}", e);
                HashMap::new()
            })
    }

    pub async fn sync_exchange_rates(&self, conn: &mut SqliteConnection) -> Result<(), String> {
        println!("Syncing exchange rates...");

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
                            source: "YAHOO".to_string(),
                            created_at: rate.created_at,
                            updated_at: Utc::now().naive_utc(),
                        });
                    }
                }
                Err(e) => {
                    eprintln!(
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
        if let Ok(quote) = self.public_data_provider.get_latest_quote(&reverse_symbol).await {
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
            match self.public_data_provider.get_latest_quote(&from_usd_symbol).await {
                Ok(quote) => quote.close,
                Err(_) => return Ok(-1.0),
            }
        } else {
            -1.0
        };

        let to_usd = if !to_usd_symbol.is_empty() {
            match self.public_data_provider.get_latest_quote(&to_usd_symbol).await {
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
}
