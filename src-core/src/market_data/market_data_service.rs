use crate::models::{Asset, NewAsset, Quote, QuoteSummary};
use crate::providers::yahoo_provider::YahooProvider;
use crate::schema::{activities, quotes};
use chrono::{Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::time::SystemTime;

pub struct MarketDataService {
    provider: YahooProvider,
    pool: Pool<ConnectionManager<SqliteConnection>>,
}

impl MarketDataService {
    pub async fn new(pool: Pool<ConnectionManager<SqliteConnection>>) -> Self {
        MarketDataService {
            provider: YahooProvider::new()
                .await
                .expect("Failed to initialize YahooProvider"),
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

    pub async fn sync_quotes(&self, symbols: &[String]) -> Result<(), String> {
        println!("Syncing history quotes for all assets...");
        let end_date = SystemTime::now();
        let mut all_quotes_to_insert = Vec::new();

        for symbol in symbols {
            let last_sync_date = self
                .get_last_quote_sync_date(symbol)
                .map_err(|e| format!("Error getting last sync date for {}: {}", symbol, e))?
                .unwrap_or_else(|| Utc::now().naive_utc() - Duration::days(3 * 365));

            let start_date: SystemTime = Utc
                .from_utc_datetime(&(last_sync_date - Duration::days(1)))
                .into();

            match self
                .provider
                .fetch_stock_history(symbol, start_date, end_date)
                .await
            {
                Ok(quotes) => all_quotes_to_insert.extend(quotes),
                Err(e) => eprintln!("Error fetching history for {}: {}. Skipping.", symbol, e),
            }
        }

        self.insert_quotes(&all_quotes_to_insert)
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

    fn insert_quotes(&self, quotes: &[Quote]) -> Result<(), String> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        diesel::replace_into(quotes::table)
            .values(quotes)
            .execute(&mut conn)
            .map_err(|e| format!("Failed to insert quotes: {}", e))?;
        Ok(())
    }

    pub async fn initialize_and_sync_quotes(&self) -> Result<(), String> {
        use crate::schema::assets::dsl::*;
        // self.initialize_provider().await?;
        let conn = &mut self.pool.get().map_err(|e| e.to_string())?;
        let asset_list: Vec<Asset> = assets
            .load::<Asset>(conn)
            .map_err(|e| format!("Failed to load assets: {}", e))?;

        self.sync_quotes(
            &asset_list
                .iter()
                .map(|asset| asset.symbol.clone())
                .collect::<Vec<String>>(),
        )
        .await
    }
    //self.initialize_provider().await?;
    pub async fn fetch_symbol_summary(&self, symbol: &str) -> Result<NewAsset, String> {
        self.provider
            .fetch_quote_summary(symbol)
            .await
            .map_err(|e| e.to_string())
    }

    pub fn get_asset_currencies(&self, asset_ids: Vec<String>) -> HashMap<String, String> {
        use crate::schema::assets::dsl::*;

        let db_connection = &mut self.pool.get().expect("Couldn't get db connection");

        assets
            .filter(id.eq_any(asset_ids))
            .select((id, currency))
            .load::<(String, String)>(db_connection)
            .map(|results| results.into_iter().collect::<HashMap<_, _>>())
            .unwrap_or_else(|e| {
                eprintln!("Error fetching asset currencies: {}", e);
                HashMap::new()
            })
    }
}
