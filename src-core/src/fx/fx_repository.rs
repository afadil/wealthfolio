use crate::market_data::market_data_model::{Quote, QuoteDB}; 
use crate::schema::{quotes, assets};
use crate::assets::assets_model::AssetDB;
use crate::assets::assets_constants::CURRENCY_ASSET_TYPE;
use chrono::NaiveDate;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sql_query;
use diesel::sqlite::SqliteConnection;
use std::collections::HashMap;
use std::sync::Arc;
use crate::db::get_connection;
use super::fx_errors::FxError;
use super::fx_model::ExchangeRate;
use log::error;

pub struct FxRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl FxRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }

    pub fn get_all_currency_quotes(&self) -> Result<HashMap<String, Vec<Quote>>, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        // Use a more efficient query that directly gets currency quotes
        let query = "
            SELECT q.*
            FROM quotes q
            INNER JOIN assets a ON q.symbol = a.symbol
            WHERE a.asset_type = 'CURRENCY'
            ORDER BY q.symbol, q.date";

        let quotes: Vec<QuoteDB> = diesel::sql_query(query)
            .load(&mut conn)?;

        // Group quotes by symbol efficiently
        let mut grouped_quotes: HashMap<String, Vec<Quote>> = HashMap::with_capacity(100);
        for quote_db in quotes {
            let quote = Quote::from(quote_db);
            grouped_quotes
                .entry(quote.symbol.clone())
                .or_insert_with(Vec::new)
                .push(quote);
        }

        Ok(grouped_quotes)
    }

    pub fn get_latest_currency_rates(&self) -> Result<HashMap<String, f64>, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        let query = "
            WITH LatestQuotes AS (
                SELECT q.* 
                FROM quotes q
                INNER JOIN assets a ON q.symbol = a.symbol 
                WHERE a.asset_type = 'CURRENCY'
                AND (q.symbol, q.date) IN (
                    SELECT symbol, MAX(date)
                    FROM quotes
                    GROUP BY symbol
                )
            )
            SELECT * FROM LatestQuotes";

        let quotes: Vec<QuoteDB> = diesel::sql_query(query)
            .load(&mut conn)?;

        Ok(quotes.into_iter().map(|q| (q.symbol, q.close)).collect())
    }

    pub fn get_exchange_rates(&self) -> Result<Vec<ExchangeRate>, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        let latest_quotes = sql_query(
            "SELECT q.* FROM quotes q
             INNER JOIN assets a ON q.symbol = a.symbol AND a.asset_type = 'CURRENCY'
             INNER JOIN (
                 SELECT symbol, MAX(date) as max_date
                 FROM quotes
                 GROUP BY symbol
             ) latest ON q.symbol = latest.symbol AND q.date = latest.max_date
             ORDER BY q.symbol"
        )
        .load::<QuoteDB>(&mut conn)?;

        Ok(latest_quotes
            .into_iter()
            .map(|q| ExchangeRate::from_quote(&Quote::from(q)))
            .collect())
    }

    pub fn get_exchange_rate(
        &self,
        from: &str,
        to: &str,
    ) -> Result<Option<ExchangeRate>, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        let symbol = format!("{}{}=X", from, to);
        let quote = quotes::table
            .filter(quotes::symbol.eq(symbol))
            .order_by(quotes::date.desc())
            .first::<QuoteDB>(&mut conn)
            .optional()?;

        Ok(quote.map(|q| ExchangeRate::from_quote(&Quote::from(q))))
    }

    pub fn get_exchange_rate_by_id(
        &self,
        id: &str,
    ) -> Result<Option<ExchangeRate>, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        let quote = quotes::table
            .filter(quotes::symbol.eq(id))
            .order_by(quotes::date.desc())
            .first::<QuoteDB>(&mut conn)
            .optional()?;

        Ok(quote.map(|q| ExchangeRate::from_quote(&Quote::from(q))))
    }

    pub fn get_historical_quotes(
        &self,
        symbol: &str,
        start_date: chrono::NaiveDateTime,
        end_date: chrono::NaiveDateTime,
    ) -> Result<Vec<Quote>, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        let quotes = quotes::table
            .filter(quotes::symbol.eq(symbol))
            .filter(quotes::date.ge(start_date))
            .filter(quotes::date.le(end_date))
            .order_by(quotes::date.asc())
            .load::<QuoteDB>(&mut conn)?;

        Ok(quotes.into_iter().map(Quote::from).collect())
    }

    pub fn add_quote(
        &self,
        symbol: String,
        date: String,
        rate: f64,
        source: String,
    ) -> Result<Quote, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        let quote = QuoteDB {
            id: format!("{}_{}", date.replace("-", ""), symbol),
            symbol,
            date: NaiveDate::parse_from_str(&date, "%Y-%m-%d")
                .unwrap()
                .and_hms_opt(0, 0, 0)
                .unwrap(),
            open: rate,
            high: rate,
            low: rate,
            close: rate,
            adjclose: rate,
            volume: 0.0,
            data_source: source,
            created_at: chrono::Utc::now().naive_utc(),
        };

        diesel::insert_into(quotes::table)
            .values(&quote)
            .on_conflict((quotes::symbol, quotes::date, quotes::data_source))
            .do_update()
            .set((
                quotes::close.eq(quote.close),
                quotes::data_source.eq(&quote.data_source),
            ))
            .execute(&mut conn)?;

        Ok(quotes::table
            .filter(quotes::symbol.eq(&quote.symbol))
            .filter(quotes::date.eq(&quote.date))
            .filter(quotes::data_source.eq(&quote.data_source))
            .first::<QuoteDB>(&mut conn)
            .map(Quote::from)?)
    }

    pub fn upsert_exchange_rate(
        &self,
        rate: ExchangeRate,
    ) -> Result<ExchangeRate, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        let quote = rate.to_quote();
        let quote_db = QuoteDB::from(quote.clone());

        match diesel::insert_into(quotes::table)
            .values(&quote_db)
            .on_conflict(quotes::id)
            .do_update()
            .set((
                quotes::open.eq(quote_db.open),
                quotes::high.eq(quote_db.high),
                quotes::low.eq(quote_db.low),
                quotes::close.eq(quote_db.close),
                quotes::adjclose.eq(quote_db.adjclose),
                quotes::volume.eq(quote_db.volume),
                quotes::data_source.eq(&quote_db.data_source),
            ))
            .execute(&mut conn) {
                Ok(_) => (),
                Err(e) => {
                    error!(
                        "Failed to upsert exchange rate. Error: {}. Payload: id={}, symbol={}, date={}, close={}, source={}", 
                        e,
                        quote_db.id,
                        quote_db.symbol, 
                        quote_db.date, 
                        quote_db.close, 
                        quote_db.data_source
                    );
                    return Err(FxError::SaveError(e.to_string()));
                }
            };

        quotes::table
            .filter(quotes::id.eq(&quote_db.id))
            .first::<QuoteDB>(&mut conn)
            .map(|q| ExchangeRate::from_quote(&Quote::from(q)))
            .map_err(|e| {
                error!(
                    "Failed to fetch upserted exchange rate. Error: {}. Payload: id={}", 
                    e, 
                    quote_db.id
                );
                FxError::FetchError(e.to_string())
            })
    }

    pub fn update_exchange_rate(
        &self,
        rate: &ExchangeRate,
    ) -> Result<ExchangeRate, FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        let quote = rate.to_quote();
        let quote_db = QuoteDB::from(quote);

        diesel::update(quotes::table)
            .filter(quotes::symbol.eq(&quote_db.symbol))
            .filter(quotes::date.eq(&quote_db.date))
            .set((
                quotes::close.eq(quote_db.close),
                quotes::data_source.eq(&quote_db.data_source),
            ))
            .get_result::<QuoteDB>(&mut conn)
            .map(|q| ExchangeRate::from_quote(&Quote::from(q)))
            .map_err(|e| e.into())
    }

    pub fn delete_exchange_rate(
        &self,
        rate_id: &str,
    ) -> Result<(), FxError> {
        let mut conn = get_connection(&self.pool)?;
        
        diesel::delete(quotes::table.filter(quotes::symbol.eq(rate_id)))
            .execute(&mut conn)?;
        Ok(())
    }

    /// Creates a new FX asset in the database
    pub fn create_fx_asset(&self, from: &str, to: &str, source: &str) -> Result<(), FxError> {
        let mut conn = get_connection(&self.pool)?;
        let symbol = ExchangeRate::make_fx_symbol(from, to);
        let readable_name = format!("{}/{} Exchange Rate", from, to);
        let comment = format!(
            "Currency pair for converting from {} to {}",
            from, to
        );
        let now = chrono::Utc::now().naive_utc();

        let asset_db = AssetDB {
            id: symbol.clone(),
            symbol: symbol.clone(),
            name: Some(readable_name),
            asset_type: Some(CURRENCY_ASSET_TYPE.to_string()),
            comment: Some(comment),
            currency: from.to_string(),
            data_source: source.to_string(),
            created_at: now,
            updated_at: now,
            ..Default::default()
        };

        diesel::insert_into(assets::table)
            .values(&asset_db)
            .execute(&mut conn)
            .map_err(|e| FxError::SaveError(e.to_string()))?;

        Ok(())
    }

}
