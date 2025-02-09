use crate::models::{ExchangeRate, Quote};
use crate::schema::quotes;
use chrono::NaiveDate;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, PooledConnection};
use diesel::sql_query;
use diesel::sqlite::SqliteConnection;
use std::collections::HashMap;

pub struct FxRepository;

impl FxRepository {
    
    pub fn get_all_currency_quotes(
        conn: &mut SqliteConnection,
    ) -> QueryResult<HashMap<String, Vec<Quote>>> {
        // Use a more efficient query that directly gets currency quotes
        let query = "
            SELECT q.*
            FROM quotes q
            INNER JOIN assets a ON q.symbol = a.symbol
            WHERE a.asset_type = 'Currency'
            ORDER BY q.symbol, q.date";

        let quotes: Vec<Quote> = diesel::sql_query(query)
            .load(conn)?;

        // Group quotes by symbol efficiently
        let mut grouped_quotes: HashMap<String, Vec<Quote>> = HashMap::with_capacity(100);
        for quote in quotes {
            grouped_quotes
                .entry(quote.symbol.clone())
                .or_insert_with(Vec::new)
                .push(quote);
        }

        Ok(grouped_quotes)
    }

    pub fn get_latest_currency_rates(
        conn: &mut SqliteConnection,
    ) -> QueryResult<HashMap<String, f64>> {
        let query = "
            WITH LatestQuotes AS (
                SELECT q.* 
                FROM quotes q
                INNER JOIN assets a ON q.symbol = a.symbol 
                WHERE a.asset_type = 'Currency'
                AND (q.symbol, q.date) IN (
                    SELECT symbol, MAX(date)
                    FROM quotes
                    GROUP BY symbol
                )
            )
            SELECT * FROM LatestQuotes";

        let quotes = diesel::sql_query(query)
            .load::<Quote>(conn)?;

        Ok(quotes.into_iter().map(|q| (q.symbol, q.close)).collect())
    }

    pub fn get_exchange_rates(conn: &mut SqliteConnection) -> QueryResult<Vec<ExchangeRate>> {
        let latest_quotes = sql_query(
            "SELECT q.* FROM quotes q
             INNER JOIN assets a ON q.symbol = a.symbol AND a.asset_type = 'Currency'
             INNER JOIN (
                 SELECT symbol, MAX(date) as max_date
                 FROM quotes
                 GROUP BY symbol
             ) latest ON q.symbol = latest.symbol AND q.date = latest.max_date
             ORDER BY q.symbol"
        )
        .load::<Quote>(conn)?;

        Ok(latest_quotes
            .into_iter()
            .map(|q| ExchangeRate::from_quote(&q))
            .collect())
    }

    pub fn get_exchange_rate(
        conn: &mut SqliteConnection,
        from: &str,
        to: &str,
    ) -> QueryResult<Option<ExchangeRate>> {
        let symbol = format!("{}{}=X", from, to);
        let quote = quotes::table
            .filter(quotes::symbol.eq(symbol))
            .order_by(quotes::date.desc())
            .first::<Quote>(conn)
            .optional()?;

        Ok(quote.map(|q| ExchangeRate::from_quote(&q)))
    }

    pub fn get_exchange_rate_by_id(
        conn: &mut SqliteConnection,
        id: &str,
    ) -> QueryResult<Option<ExchangeRate>> {
        let quote = quotes::table
            .filter(quotes::symbol.eq(id))
            .order_by(quotes::date.desc())
            .first::<Quote>(conn)
            .optional()?;

        Ok(quote.map(|q| ExchangeRate::from_quote(&q)))
    }

    pub fn add_quote(
        conn: &mut SqliteConnection,
        symbol: String,
        date: String,
        rate: f64,
        source: String,
    ) -> QueryResult<Quote> {
        let quote = Quote {
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
            .execute(conn)?;

        quotes::table
            .filter(quotes::symbol.eq(&quote.symbol))
            .filter(quotes::date.eq(&quote.date))
            .filter(quotes::data_source.eq(&quote.data_source))
            .first::<Quote>(conn)
    }

    pub fn upsert_exchange_rate(
        conn: &mut SqliteConnection,
        rate: ExchangeRate,
    ) -> QueryResult<ExchangeRate> {
        let quote = Quote::from_exchange_rate(&rate);

        // First try to update
        let update_result = diesel::update(quotes::table)
            .filter(quotes::symbol.eq(&quote.symbol))
            .filter(quotes::date.eq(&quote.date))
            .filter(quotes::data_source.eq(&quote.data_source))
            .set((
                quotes::close.eq(quote.close),
                quotes::data_source.eq(&quote.data_source),
            ))
            .execute(conn);

        match update_result {
            Ok(0) => {
                // No rows updated, so insert
                diesel::insert_into(quotes::table)
                    .values(&quote)
                    .execute(conn)?;
            }
            Ok(_) => {
                // Update successful
            }
            Err(e) => return Err(e),
        }

        quotes::table
            .filter(quotes::symbol.eq(&quote.symbol))
            .filter(quotes::date.eq(&quote.date))
            .filter(quotes::data_source.eq(&quote.data_source))
            .first::<Quote>(conn)
            .map(|q| ExchangeRate::from_quote(&q))
    }

    pub fn update_exchange_rate(
        conn: &mut SqliteConnection,
        rate: &ExchangeRate,
    ) -> QueryResult<ExchangeRate> {
        let quote = Quote::from_exchange_rate(rate);

        diesel::update(quotes::table)
            .filter(quotes::symbol.eq(&quote.symbol))
            .filter(quotes::date.eq(&quote.date))
            .set((
                quotes::close.eq(quote.close),
                quotes::data_source.eq(&quote.data_source),
            ))
            .get_result::<Quote>(conn)
            .map(|q| ExchangeRate::from_quote(&q))
    }

    pub fn delete_exchange_rate(
        conn: &mut PooledConnection<ConnectionManager<SqliteConnection>>,
        rate_id: &str,
    ) -> Result<(), diesel::result::Error> {
        diesel::delete(quotes::table.filter(quotes::symbol.eq(rate_id)))
            .execute(conn)
            .map(|_| ())
    }



}
