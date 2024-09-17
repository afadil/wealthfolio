use crate::models::{Asset, NewAsset, Quote, QuoteSummary};
use crate::providers::yahoo_provider::YahooProvider;
use crate::schema::{activities, quotes};
use chrono::{Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::time::SystemTime;
use uuid::Uuid;

pub struct MarketDataService {
    provider: YahooProvider,
    pool: Pool<ConnectionManager<SqliteConnection>>,
}

impl MarketDataService {
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>) -> Self {
        MarketDataService {
            provider: YahooProvider::new().expect("Failed to initialize YahooProvider"),
            pool,
        }
    }

    pub async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>, String> {
        self.provider
            .search_ticker(query)
            .await
            .map_err(|e| e.to_string())
    }

    pub fn get_latest_quote(&self, symbol: &str) -> QueryResult<Quote> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        quotes::table
            .filter(quotes::symbol.eq(symbol))
            .order(quotes::date.desc())
            .first::<Quote>(&mut conn)
    }

    pub fn get_history_quotes(&self) -> Result<Vec<Quote>, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        quotes::table.load::<Quote>(&mut conn)
    }

    pub fn load_quotes(&self) -> HashMap<(String, NaiveDate), Quote> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        let quotes_result: QueryResult<Vec<Quote>> = quotes::table.load::<Quote>(&mut conn);

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

    // pub fn load_quotes(
    //     &self,
    //     asset_ids: &HashSet<String>,
    //     start_date: NaiveDate,
    //     end_date: NaiveDate,
    // ) -> HashMap<(String, NaiveDate), Quote> {
    //     let start_datetime = NaiveDateTime::new(
    //         start_date,
    //         chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
    //     );
    //     let end_datetime = NaiveDateTime::new(
    //         end_date,
    //         chrono::NaiveTime::from_hms_opt(23, 59, 59).unwrap(),
    //     );

    //     let mut conn = self.pool.get().expect("Couldn't get db connection");
    //     let quotes_result: QueryResult<Vec<Quote>> = quotes::table
    //         .filter(quotes::symbol.eq_any(asset_ids))
    //         .filter(quotes::date.between(start_datetime, end_datetime))
    //         .load::<Quote>(&mut conn);

    //     match quotes_result {
    //         Ok(quotes) => quotes
    //             .into_iter()
    //             .map(|quote| {
    //                 let quote_date = quote.date.date();
    //                 ((quote.symbol.clone(), quote_date), quote)
    //             })
    //             .collect(),
    //         Err(e) => {
    //             eprintln!("Error loading quotes: {}", e);
    //             HashMap::new()
    //         }
    //     }
    // }

    pub async fn initialize_crumb_data(&self) -> Result<(), String> {
        self.provider.set_crumb().await.map_err(|e| {
            let error_message = format!("Failed to initialize crumb data: {}", e);
            eprintln!("{}", &error_message);
            error_message
        })
    }

    fn get_last_quote_sync_date(
        &self,
        ticker: &str,
    ) -> Result<Option<NaiveDateTime>, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");

        quotes::table
            .filter(quotes::symbol.eq(ticker))
            .select(diesel::dsl::max(quotes::date))
            .first::<Option<NaiveDateTime>>(&mut conn)
            .or_else(|_| {
                activities::table
                    .filter(activities::asset_id.eq(ticker))
                    .select(diesel::dsl::min(activities::activity_date))
                    .first::<Option<NaiveDateTime>>(&mut conn)
            })
    }

    pub async fn sync_history_quotes_for_all_assets(
        &self,
        asset_list: &[Asset],
    ) -> Result<(), String> {
        println!("Syncing history quotes for all assets...");

        let end_date = SystemTime::now();
        let mut all_quotes_to_insert = Vec::new();

        for asset in asset_list {
            let symbol = asset.symbol.as_str();
            let last_sync_date = self
                .get_last_quote_sync_date(symbol)
                .map_err(|e| format!("Error getting last sync date for {}: {}", symbol, e))?
                .unwrap_or_else(|| Utc::now().naive_utc() - Duration::days(3 * 365));

            // Ensure to synchronize the last 2 days data for freshness
            let start_date: SystemTime = Utc
                .from_utc_datetime(&(last_sync_date - Duration::days(2)))
                .into();

            match self
                .provider
                .fetch_stock_history(symbol, start_date, end_date)
                .await
            {
                Ok(quotes_history) => {
                    for yahoo_quote in quotes_history {
                        if let Some(new_quote) = self.create_quote_from_yahoo(yahoo_quote, symbol) {
                            all_quotes_to_insert.push(new_quote);
                        }
                    }
                }
                Err(e) => eprintln!("Error fetching history for {}: {}. Skipping.", symbol, e),
            }
        }

        self.insert_quotes(&all_quotes_to_insert)
    }

    fn create_quote_from_yahoo(
        &self,
        yahoo_quote: yahoo_finance_api::Quote,
        symbol: &str,
    ) -> Option<Quote> {
        chrono::DateTime::from_timestamp(yahoo_quote.timestamp as i64, 0).map(|datetime| {
            let naive_datetime = datetime.naive_utc();
            Quote {
                id: Uuid::new_v4().to_string(),
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
            }
        })
    }

    fn insert_quotes(&self, quotes: &[Quote]) -> Result<(), String> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        diesel::replace_into(quotes::table)
            .values(quotes)
            .execute(&mut conn)
            .map_err(|e| format!("Failed to insert quotes: {}", e))?;
        Ok(())
    }

    pub async fn initialize_and_sync_quotes(&self, asset_list: &[Asset]) -> Result<(), String> {
        self.initialize_crumb_data().await?;
        self.sync_history_quotes_for_all_assets(asset_list).await
    }

    pub async fn fetch_symbol_summary(&self, symbol: &str) -> Result<NewAsset, String> {
        self.provider
            .fetch_quote_summary(symbol)
            .await
            .map_err(|e| e.to_string())
    }
}
