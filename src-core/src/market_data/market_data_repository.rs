use chrono::{NaiveDate, NaiveDateTime};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::collections::HashMap;
use std::sync::Arc;

use super::market_data_errors::{MarketDataError, Result};
use super::market_data_model::{Quote, QuoteDB, QuoteUpdate, QuoteRequest, DataSource, QuoteWithCurrency};
use crate::activities::activities_model::{Activity, ActivityDB};
use crate::assets::assets_model::{Asset, AssetDB};
use crate::assets::CASH_ASSET_TYPE;
use crate::db::get_connection;
use crate::schema::{activities, assets, quotes};

pub struct MarketDataRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl MarketDataRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }

    pub fn get_latest_quote(&self, symbol: &str) -> Result<Quote> {
        let mut conn = get_connection(&self.pool)?;

        diesel::sql_query(format!(
            "SELECT q.*, a.currency
             FROM quotes q
             INNER JOIN assets a ON q.symbol = a.symbol
             WHERE q.symbol = '{}'
             ORDER BY q.date DESC
             LIMIT 1",
            symbol
        ))
        .get_result::<QuoteWithCurrency>(&mut conn)
        .map(Quote::from)
        .map_err(MarketDataError::DatabaseError)
    }

    pub fn get_latest_quotes(&self, symbols: &[String]) -> Result<HashMap<String, Quote>> {
        let mut conn = get_connection(&self.pool)?;

        // Use a subquery to get the latest date for each symbol and join with assets for currency
        let latest_quotes = diesel::sql_query(format!(
            "WITH LatestDates AS (
                SELECT symbol, MAX(date) as max_date
                FROM quotes
                WHERE symbol IN ({})
                GROUP BY symbol
            )
            SELECT 
                q.*,
                a.currency
            FROM quotes q
            INNER JOIN LatestDates ld
                ON q.symbol = ld.symbol
                AND q.date = ld.max_date
            INNER JOIN assets a
                ON q.symbol = a.symbol",
            symbols
                .iter()
                .map(|s| format!("'{}'", s))
                .collect::<Vec<_>>()
                .join(",")
        ))
        .load::<QuoteWithCurrency>(&mut conn)
        .map_err(MarketDataError::DatabaseError)?;

        Ok(latest_quotes
            .into_iter()
            .map(|quote| {
                let quote = Quote::from(quote);
                (quote.symbol.clone(), quote)
            })
            .collect())
    }

    pub fn get_quote_history(
        &self,
        symbol: &str
    ) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        diesel::sql_query(format!(
            "SELECT q.*, a.currency
             FROM quotes q
             INNER JOIN assets a ON q.symbol = a.symbol
             WHERE q.symbol = '{}'
             ORDER BY q.date DESC",
            symbol
        ))
        .load::<QuoteWithCurrency>(&mut conn)
        .map(|quotes| quotes.into_iter().map(Quote::from).collect())
        .map_err(MarketDataError::DatabaseError)
    }

    pub fn insert_quotes(&self, quotes: &[Quote]) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;

        // Process quotes in batches to avoid too many parameters in one query
        for chunk in quotes.chunks(100) {
            let quote_dbs: Vec<QuoteDB> = chunk.iter().map(|q| QuoteDB::from(q.clone())).collect();
            
            // For each quote, create an INSERT OR REPLACE statement
            for quote_db in quote_dbs {
                diesel::sql_query(format!(
                    "INSERT OR REPLACE INTO quotes 
                    (id, symbol, date, open, high, low, close, adjclose, volume, data_source) 
                    VALUES ('{}', '{}', '{}', {}, {}, {}, {}, {}, {}, '{}')",
                    quote_db.id,
                    quote_db.symbol,
                    quote_db.date,
                    quote_db.open,
                    quote_db.high,
                    quote_db.low,
                    quote_db.close,
                    quote_db.adjclose,
                    quote_db.volume,
                    quote_db.data_source
                ))
                .execute(&mut conn)
                .map_err(MarketDataError::DatabaseError)?;
            }
        }

        Ok(())
    }

    pub fn insert_quote(&self, quote: &Quote) -> Result<Quote> {
        let mut conn = get_connection(&self.pool)?;

        let quote_db = QuoteDB::from(quote.clone());

        // Use INSERT OR REPLACE to handle existing quotes
        diesel::sql_query(format!(
            "INSERT OR REPLACE INTO quotes 
            (id, symbol, date, open, high, low, close, adjclose, volume, data_source) 
            VALUES ('{}', '{}', '{}', {}, {}, {}, {}, {}, {}, '{}')",
            quote_db.id,
            quote_db.symbol,
            quote_db.date,
            quote_db.open,
            quote_db.high,
            quote_db.low,
            quote_db.close,
            quote_db.adjclose,
            quote_db.volume,
            quote_db.data_source
        ))
        .execute(&mut conn)
        .map_err(MarketDataError::DatabaseError)?;

        Ok(quote.clone())
    }

    pub fn update_quote(&self, quote_update: QuoteUpdate) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;

        diesel::update(quotes::table)
            .filter(quotes::id.eq(&quote_update.id))
            .set((
                quotes::open.eq(quote_update.open),
                quotes::high.eq(quote_update.high),
                quotes::low.eq(quote_update.low),
                quotes::close.eq(quote_update.close),
                quotes::adjclose.eq(quote_update.adjclose),
                quotes::volume.eq(quote_update.volume),
            ))
            .execute(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        Ok(())
    }

    pub fn delete_quote(&self, quote_id: &str) -> Result<()> {
        let mut conn =
            get_connection(&self.pool).map_err(MarketDataError::DatabaseConnectionError)?;

        diesel::delete(quotes::table.filter(quotes::id.eq(quote_id)))
            .execute(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        Ok(())
    }

    pub fn get_last_quote_date(&self, symbol: &str) -> Result<Option<NaiveDateTime>> {
        let mut conn =
            get_connection(&self.pool).map_err(MarketDataError::DatabaseConnectionError)?;

        quotes::table
            .filter(quotes::symbol.eq(symbol))
            .select(quotes::date)
            .order(quotes::date.desc())
            .first::<NaiveDateTime>(&mut conn)
            .optional()
            .map_err(MarketDataError::DatabaseError)
    }

    pub fn get_activities_by_asset(&self, asset_id: &str) -> Result<Vec<Activity>> {
        let mut conn =
            get_connection(&self.pool).map_err(MarketDataError::DatabaseConnectionError)?;

        activities::table
            .filter(activities::asset_id.eq(asset_id))
            .order(activities::activity_date.asc())
            .select(activities::all_columns)
            .load::<ActivityDB>(&mut conn)
            .map(|activities| activities.into_iter().map(Activity::from).collect())
            .map_err(MarketDataError::DatabaseError)
    }

    pub fn get_quotes_by_source(&self, symbol: &str, data_source: &str) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        diesel::sql_query(format!(
            "SELECT q.*, a.currency
             FROM quotes q
             INNER JOIN assets a ON q.symbol = a.symbol
             WHERE q.symbol = '{}'
             AND q.data_source = '{}'
             ORDER BY q.date ASC",
            symbol,
            data_source
        ))
        .load::<QuoteWithCurrency>(&mut conn)
        .map(|quotes| quotes.into_iter().map(Quote::from).collect())
        .map_err(MarketDataError::DatabaseError)
    }

    pub fn get_assets_by_symbols(&self, symbols: &[String]) -> Result<Vec<Asset>> {
        let mut conn =
            get_connection(&self.pool).map_err(MarketDataError::DatabaseConnectionError)?;

        assets::table
            .filter(assets::symbol.eq_any(symbols))
            .load::<AssetDB>(&mut conn)
            .map(|assets| assets.into_iter().map(Asset::from).collect())
            .map_err(MarketDataError::DatabaseError)
    }

    pub fn delete_quotes_for_symbols(&self, symbols: &[String]) -> Result<()> {
        let mut conn =
            get_connection(&self.pool).map_err(MarketDataError::DatabaseConnectionError)?;

        diesel::delete(quotes::table.filter(quotes::symbol.eq_any(symbols)))
            .execute(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;
        Ok(())
    }

    pub fn get_quote_requests_by_symbols(&self, symbols: &[String]) -> Result<Vec<QuoteRequest>> {
        let mut conn =
            get_connection(&self.pool).map_err(MarketDataError::DatabaseConnectionError)?;

        // Get the data sources for each symbol from the assets table
        let results = assets::table
            .filter(assets::symbol.eq_any(symbols))
            .select((assets::symbol, assets::data_source))
            .load::<(String, String)>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        // Convert to QuoteRequests
        let quote_requests = results
            .into_iter()
            .map(|(symbol, data_source)| QuoteRequest {
                symbol,
                data_source: DataSource::from(data_source.as_str()),
            })
            .collect();

        Ok(quote_requests)
    }

    pub fn get_asset_currencies(&self) -> Result<HashMap<String, String>> {
        let mut conn =
            get_connection(&self.pool).map_err(MarketDataError::DatabaseConnectionError)?;

        let results = assets::table
            .select((assets::symbol, assets::currency))
            .load::<(String, String)>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        Ok(results.into_iter().collect())
    }

    pub fn get_all_quotes(&self) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        diesel::sql_query(
            "SELECT q.*, a.currency
             FROM quotes q
             INNER JOIN assets a ON q.symbol = a.symbol
             ORDER BY q.date DESC"
        )
        .load::<QuoteWithCurrency>(&mut conn)
        .map(|quotes| quotes.into_iter().map(Quote::from).collect())
        .map_err(MarketDataError::DatabaseError)
    }

    pub fn get_all_quote_requests(&self) -> Result<Vec<QuoteRequest>> {
        let mut conn =
            get_connection(&self.pool).map_err(MarketDataError::DatabaseConnectionError)?;

        // Get all non-cash assets with their data sources
        let results = assets::table
            .filter(assets::asset_type.ne(CASH_ASSET_TYPE.to_string()))
            .select((assets::symbol, assets::data_source))
            .load::<(String, String)>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        // Convert to QuoteRequests
        let quote_requests = results
            .into_iter()
            .map(|(symbol, data_source)| QuoteRequest {
                symbol,
                data_source: DataSource::from(data_source.as_str()),
            })
            .collect();

        Ok(quote_requests)
    }
}
