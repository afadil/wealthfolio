use crate::models::{Asset, ExchangeRate, NewAsset, Quote, QuoteSummary};
use crate::providers::market_data_factory::{MarketDataFactory, DEFAULT_PROVIDER};
use crate::providers::market_data_provider::{MarketDataError, MarketDataProvider};
use crate::schema::{activities, exchange_rates, quotes};
use chrono::{Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;

pub struct MarketDataService {
    provider: Arc<dyn MarketDataProvider>,
}

impl MarketDataService {
    pub async fn new() -> Self {
        MarketDataService {
            provider: MarketDataFactory::get_provider(Some(DEFAULT_PROVIDER)).await,
        }
    }

    pub async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        self.provider.search_ticker(query).await
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

    pub fn get_history_quotes(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Quote>, diesel::result::Error> {
        quotes::table.load::<Quote>(conn)
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

    pub async fn sync_quotes(
        &self,
        conn: &mut SqliteConnection,
        symbols: &[String],
    ) -> Result<(), String> {
        println!("Syncing history quotes for all assets...");
        let end_date = SystemTime::now();
        let mut all_quotes_to_insert = Vec::new();

        for symbol in symbols {
            let last_sync_date = self
                .get_last_quote_sync_date(conn, symbol)
                .map_err(|e| format!("Error getting last sync date for {}: {}", symbol, e))?
                .unwrap_or_else(|| Utc::now().naive_utc() - Duration::days(3 * 365));

            let start_date: SystemTime = Utc
                .from_utc_datetime(&(last_sync_date - Duration::days(1)))
                .into();

            match self
                .provider
                .get_stock_history(symbol, start_date, end_date)
                .await
            {
                Ok(quotes) => all_quotes_to_insert.extend(quotes),
                Err(e) => {
                    eprintln!("Error fetching history for {}: {}. Skipping.", symbol, e);
                }
            }
        }

        self.insert_quotes(conn, &all_quotes_to_insert)
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

        self.sync_quotes(
            conn,
            &asset_list
                .iter()
                .map(|asset| asset.symbol.clone())
                .collect::<Vec<String>>(),
        )
        .await?;

        Ok(())
    }
    pub async fn get_symbol_profile(&self, symbol: &str) -> Result<NewAsset, String> {
        self.provider
            .get_symbol_profile(symbol)
            .await
            .map_err(|e| e.to_string())
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
        if let Ok(quote) = self.provider.get_latest_quote(&symbol).await {
            return Ok(quote.close);
        }

        // Try reverse conversion
        let reverse_symbol = format!("{}{}=X", to, from);
        if let Ok(quote) = self.provider.get_latest_quote(&reverse_symbol).await {
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
            match self.provider.get_latest_quote(&from_usd_symbol).await {
                Ok(quote) => quote.close,
                Err(_) => return Ok(-1.0),
            }
        } else {
            -1.0
        };

        let to_usd = if !to_usd_symbol.is_empty() {
            match self.provider.get_latest_quote(&to_usd_symbol).await {
                Ok(quote) => quote.close,
                Err(_) => return Ok(-1.0),
            }
        } else {
            1.0
        };

        Ok(from_usd / to_usd)
    }
}
