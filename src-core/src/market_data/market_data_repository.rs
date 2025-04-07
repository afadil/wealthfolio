use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::collections::HashMap;
use std::sync::Arc;

use crate::errors::Result;
use crate::db::get_connection;
use crate::market_data::market_data_model::QuoteDb;
use crate::schema::quotes::dsl::*;
use crate::schema::quotes;
use super::market_data_model::Quote;
use super::market_data_errors::MarketDataError;
use super::market_data_traits::MarketDataRepositoryTrait;

pub struct MarketDataRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl MarketDataRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }
}

impl MarketDataRepositoryTrait for MarketDataRepository {
    fn get_all_historical_quotes(&self) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        Ok(quotes
            .order(date.desc())
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?
            .into_iter()
            .map(Quote::from)
            .collect())
    }

    fn get_historical_quotes_for_symbol(&self, input_symbol: &str) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        Ok(quotes
            .filter(symbol.eq(input_symbol))
            .order(date.desc())
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?
            .into_iter()
            .map(Quote::from)
            .collect())
    }

    fn save_quotes(&self, input_quotes: &[Quote]) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;
        let transaction_result = conn.transaction(|conn| {
            // Process in smaller batches to prevent memory issues
            for chunk in input_quotes.chunks(1000) {
                // Convert Vec<Quote> to Vec<QuoteDb> (avoiding clone if possible)
                let quote_dbs: Vec<QuoteDb> = chunk.iter().map(QuoteDb::from).collect();

                diesel::replace_into(quotes::table) // Use replace_into for full replacement
                    .values(&quote_dbs)
                    .execute(conn)
                    .map_err(MarketDataError::DatabaseError)?;
            }
            Ok(())
        });

        transaction_result
    }

    fn save_quote(&self, quote: &Quote) -> Result<Quote> {
        self.save_quotes(&[quote.clone()])?;
        Ok(quote.clone())
    }

    fn delete_quote(&self, quote_id: &str) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;

        diesel::delete(quotes::table.filter(quotes::id.eq(quote_id)))
            .execute(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        Ok(())
    }
    
    fn delete_quotes_for_symbols(&self, symbols_to_delete: &[String]) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;

        diesel::delete(quotes::table.filter(symbol.eq_any(symbols_to_delete)))
            .execute(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;
        Ok(())
    }

    fn get_quotes_by_source(
        &self,
        input_symbol: &str,
        source: &str,
    ) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        Ok(quotes
            .filter(symbol.eq(input_symbol))
            .filter(data_source.eq(source))
            .order(date.asc())
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?
            .into_iter()
            .map(Quote::from)
            .collect())
    }

    fn get_latest_quote_for_symbol(&self, input_symbol: &str) -> Result<Quote> {
        let mut conn = get_connection(&self.pool)?;

        let query_result = quotes
            .filter(symbol.eq(input_symbol))
            .order(date.desc())
            .first::<QuoteDb>(&mut conn)
            .optional(); // Result<Option<QuoteDb>, diesel::result::Error>

        match query_result {
            Ok(Some(quote_db)) => Ok(Quote::from(quote_db)), // Convert QuoteDb to Quote
            Ok(None) => Err(MarketDataError::NotFound(format!(
                "No quote found in database for symbol: {}",
                input_symbol
            )).into()), // Convert MarketDataError to Error
            Err(diesel_err) => Err(MarketDataError::DatabaseError(diesel_err).into()), // Convert diesel::result::Error -> MarketDataError -> Error
        }
    }

    fn get_latest_quotes_for_symbols(
        &self,
        input_symbols: &[String],
    ) -> Result<HashMap<String, Quote>> {
        let mut conn = get_connection(&self.pool)?;

        // 1. Filter by the provided symbols.
        let filtered_quotes = quotes
            .filter(symbol.eq_any(input_symbols))
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        // 2. Group by symbol and find the maximum date for each.
        let mut latest_quotes_map: HashMap<String, QuoteDb> = HashMap::new();
        for q in filtered_quotes {
            latest_quotes_map
                .entry(q.symbol.clone())
                .and_modify(|existing_quote| {
                    if q.date > existing_quote.date {
                        *existing_quote = q.clone();
                    }
                })
                .or_insert(q);
        }

        // 3. Convert QuoteDb to Quote
        let result: HashMap<String, Quote> = latest_quotes_map
            .into_iter()
            .map(|(s, q_db)| (s, q_db.into()))
            .collect();

        Ok(result)
    }
}
