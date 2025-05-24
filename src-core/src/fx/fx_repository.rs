use super::fx_model::ExchangeRate;
use super::fx_traits::FxRepositoryTrait;
use crate::assets::assets_constants::FOREX_ASSET_TYPE;
use crate::assets::assets_model::AssetDB;
use crate::db::get_connection;
use crate::db::WriteHandle;
use crate::errors::{DatabaseError, Error, Result, ValidationError};
use crate::market_data::market_data_model::{Quote, QuoteDb};
use crate::schema::{assets, quotes};
use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sql_query;
use diesel::sqlite::SqliteConnection;
use log::error;
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

#[derive(Clone)]
pub struct FxRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl FxRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }

    pub fn get_all_currency_quotes(&self) -> Result<HashMap<String, Vec<Quote>>> {
        let mut conn = get_connection(&self.pool)?;

        let query = "
            SELECT q.*
            FROM quotes q
            INNER JOIN assets a ON q.symbol = a.id
            WHERE a.asset_type = 'FOREX'
            ORDER BY q.symbol, q.timestamp";

        let quotes_db: Vec<QuoteDb> = diesel::sql_query(query).load(&mut conn)?;

        let mut grouped_quotes: HashMap<String, Vec<Quote>> = HashMap::with_capacity(100);
        for quote_db in quotes_db {
            let quote = Quote::from(quote_db);
            grouped_quotes
                .entry(quote.symbol.clone())
                .or_insert_with(Vec::new)
                .push(quote);
        }

        Ok(grouped_quotes)
    }

    pub fn get_latest_currency_rates(&self) -> Result<HashMap<String, Decimal>> {
        let mut conn = get_connection(&self.pool)?;

        let query = "
            WITH LatestQuotes AS (
                SELECT q.* 
                FROM quotes q
                INNER JOIN assets a ON q.symbol = a.id
                WHERE a.asset_type = 'FOREX'
                AND (q.symbol, q.timestamp) IN (
                    SELECT symbol, MAX(timestamp)
                    FROM quotes
                    GROUP BY symbol
                )
            )
            SELECT * FROM LatestQuotes";

        let quotes_db: Vec<QuoteDb> = diesel::sql_query(query).load(&mut conn)?;

        Ok(quotes_db
            .into_iter()
            .map(|q| {
                (
                    q.symbol,
                    Decimal::from_str(&q.close).unwrap_or_else(|_| Decimal::from(0)),
                )
            })
            .collect())
    }

    pub fn get_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
        let mut conn = get_connection(&self.pool)?;

        let latest_quotes = sql_query(
            "SELECT q.* FROM quotes q
             INNER JOIN assets a ON q.symbol = a.id AND a.asset_type = 'FOREX'
             INNER JOIN (
                 SELECT symbol, MAX(timestamp) as max_timestamp
                 FROM quotes
                 GROUP BY symbol
             ) latest ON q.symbol = latest.symbol AND q.timestamp = latest.max_timestamp
             ORDER BY q.symbol",
        )
        .load::<QuoteDb>(&mut conn)?;

        Ok(latest_quotes
            .into_iter()
            .map(|q| ExchangeRate::from_quote(&Quote::from(q)))
            .collect())
    }

    /// Fetches all historical exchange rates (quotes) for FOREX assets.
    pub fn get_all_historical_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
        let mut conn = get_connection(&self.pool)?;

        let all_quotes_db = quotes::table
            .inner_join(assets::table.on(quotes::symbol.eq(assets::id)))
            .filter(assets::asset_type.eq(FOREX_ASSET_TYPE))
            .select(quotes::all_columns)
            .order_by((quotes::symbol.asc(), quotes::timestamp.asc()))
            .load::<QuoteDb>(&mut conn)?;

        Ok(all_quotes_db
            .into_iter()
            .map(|q_db| {
                let quote = Quote::from(q_db);
                ExchangeRate::from_quote(&quote)
            })
            .collect())
    }

    pub fn get_exchange_rate(&self, from: &str, to: &str) -> Result<Option<ExchangeRate>> {
        let mut conn = get_connection(&self.pool)?;

        let symbol = ExchangeRate::make_fx_symbol(from, to);
        let quote_db = quotes::table
            .filter(quotes::symbol.eq(symbol))
            .order_by(quotes::timestamp.desc())
            .first::<QuoteDb>(&mut conn)
            .optional()?;

        Ok(quote_db.map(|q| ExchangeRate::from_quote(&Quote::from(q))))
    }

    pub fn get_exchange_rate_by_id(&self, id: &str) -> Result<Option<ExchangeRate>> {
        let mut conn = get_connection(&self.pool)?;

        let quote_db = quotes::table
            .filter(quotes::symbol.eq(id))
            .order_by(quotes::timestamp.desc())
            .first::<QuoteDb>(&mut conn)
            .optional()?;

        Ok(quote_db.map(|q| ExchangeRate::from_quote(&Quote::from(q))))
    }

    pub fn get_historical_quotes(
        &self,
        symbol: &str,
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
    ) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        let start_dt_str = Utc.from_utc_datetime(&start_date).to_rfc3339();
        let end_dt_str = Utc.from_utc_datetime(&end_date).to_rfc3339();

        let quotes_db = quotes::table
            .filter(quotes::symbol.eq(symbol))
            .filter(quotes::timestamp.ge(start_dt_str))
            .filter(quotes::timestamp.le(end_dt_str))
            .order_by(quotes::timestamp.asc())
            .load::<QuoteDb>(&mut conn)?;

        Ok(quotes_db.into_iter().map(Quote::from).collect())
    }

    pub async fn add_quote(
        &self,
        symbol: String,
        date_str: String,
        rate: Decimal,
        source: String,
    ) -> Result<Quote> {
        self.writer
            .exec(move |conn| {
                let naive_date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").map_err(|e| {
                    Error::Validation(ValidationError::InvalidInput(format!(
                        "Invalid date format: {}",
                        e
                    )))
                })?;
                let naive_datetime = naive_date.and_hms_opt(16, 0, 0).ok_or_else(|| {
                    Error::Validation(ValidationError::InvalidInput(format!(
                        "Failed to create NaiveDateTime for {}",
                        date_str
                    )))
                })?;
                let timestamp_utc: DateTime<Utc> = Utc.from_utc_datetime(&naive_datetime);
                let timestamp_str = timestamp_utc.to_rfc3339();
                let created_at_str = Utc::now().to_rfc3339();

                let currency = symbol.split_at(3).0.to_string();
                let quote_id = format!("{}_{}", date_str.replace("-", ""), symbol);

                let quote_db = QuoteDb {
                    id: quote_id,
                    symbol: symbol.clone(),
                    timestamp: timestamp_str.clone(),
                    open: rate.to_string(),
                    high: rate.to_string(),
                    low: rate.to_string(),
                    close: rate.to_string(),
                    adjclose: rate.to_string(),
                    volume: "0".to_string(),
                    currency,
                    data_source: source.clone(),
                    created_at: created_at_str,
                };

                diesel::insert_into(quotes::table)
                    .values(&quote_db)
                    .on_conflict((quotes::symbol, quotes::timestamp, quotes::data_source))
                    .do_update()
                    .set((
                        quotes::close.eq(quote_db.close.clone()),
                        quotes::data_source.eq(&quote_db.data_source),
                    ))
                    .execute(conn)?;

                Ok(quotes::table
                    .filter(quotes::symbol.eq(&symbol))
                    .filter(quotes::timestamp.eq(&timestamp_str))
                    .filter(quotes::data_source.eq(&source))
                    .first::<QuoteDb>(conn)
                    .map(Quote::from)?)
            })
            .await
    }

    pub async fn save_exchange_rate(&self, rate: ExchangeRate) -> Result<ExchangeRate> {
        self.writer
            .exec(move |conn| {
                let quote = rate.to_quote();
                let quote_db = QuoteDb::from(&quote);

                diesel::insert_into(quotes::table)
                    .values(&quote_db)
                    .on_conflict(quotes::id)
                    .do_update()
                    .set((
                        quotes::open.eq(quote_db.open.clone()),
                        quotes::high.eq(quote_db.high.clone()),
                        quotes::low.eq(quote_db.low.clone()),
                        quotes::close.eq(quote_db.close.clone()),
                        quotes::adjclose.eq(quote_db.adjclose.clone()),
                        quotes::volume.eq(quote_db.volume.clone()),
                        quotes::data_source.eq(&quote_db.data_source),
                    ))
                    .execute(conn)?;

                quotes::table
                    .filter(quotes::id.eq(&quote_db.id))
                    .first::<QuoteDb>(conn)
                    .map(|q| ExchangeRate::from_quote(&Quote::from(q)))
                    .map_err(|e| {
                        error!(
                            "Failed to fetch upserted exchange rate. Error: {}. Payload: id={}",
                            e, quote_db.id
                        );
                        Error::Database(DatabaseError::QueryFailed(e))
                    })
            })
            .await
    }

    pub async fn update_exchange_rate(&self, rate: &ExchangeRate) -> Result<ExchangeRate> {
        let rate_owned = rate.clone();
        self.writer
            .exec(move |conn| {
                let quote = rate_owned.to_quote();
                let quote_db = QuoteDb::from(&quote);

                diesel::update(quotes::table)
                    .filter(quotes::symbol.eq(&quote_db.symbol))
                    .filter(quotes::timestamp.eq(&quote_db.timestamp))
                    .set((
                        quotes::close.eq(quote_db.close.clone()),
                        quotes::data_source.eq(&quote_db.data_source),
                    ))
                    .get_result::<QuoteDb>(conn)
                    .map(|q| ExchangeRate::from_quote(&Quote::from(q)))
                    .map_err(|e| e.into())
            })
            .await
    }

    pub async fn delete_exchange_rate(&self, rate_id: &str) -> Result<()> {
        let rate_id_owned = rate_id.to_string();
        self.writer
            .exec(move |conn| {
                diesel::delete(quotes::table.filter(quotes::symbol.eq(rate_id_owned)))
                    .execute(conn)?;
                Ok(())
            })
            .await
    }

    /// Creates or updates an FX asset in the database
    pub async fn create_fx_asset(&self, from: &str, to: &str, source: &str) -> Result<()> {
        let from_owned = from.to_string();
        let to_owned = to.to_string();
        let source_owned = source.to_string();

        self.writer
            .exec(move |conn| {
                let symbol = ExchangeRate::make_fx_symbol(&from_owned, &to_owned);
                let readable_name = format!("{}/{} Exchange Rate", &from_owned, &to_owned);
                let notes = format!(
                    "Currency pair for converting from {} to {}",
                    &from_owned, &to_owned
                );
                let now_naive = chrono::Utc::now().naive_utc();

                let asset_db = AssetDB {
                    id: symbol.clone(),
                    symbol: symbol.clone(),
                    name: Some(readable_name),
                    asset_type: Some(FOREX_ASSET_TYPE.to_string()),
                    asset_class: Some(FOREX_ASSET_TYPE.to_string()),
                    asset_sub_class: Some(FOREX_ASSET_TYPE.to_string()),
                    notes: Some(notes),
                    currency: from_owned.to_string(),
                    data_source: source_owned.to_string(),
                    created_at: now_naive,
                    updated_at: now_naive,
                    ..Default::default()
                };

                diesel::insert_into(assets::table)
                    .values(&asset_db)
                    .on_conflict(assets::id)
                    .do_update()
                    .set((
                        assets::name.eq(&asset_db.name),
                        assets::asset_type.eq(&asset_db.asset_type),
                        assets::asset_class.eq(&asset_db.asset_class),
                        assets::asset_sub_class.eq(&asset_db.asset_sub_class),
                        assets::notes.eq(&asset_db.notes),
                        assets::currency.eq(&asset_db.currency),
                        assets::data_source.eq(&asset_db.data_source),
                        assets::updated_at.eq(now_naive),
                    ))
                    .execute(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e)))?;

                Ok(())
            })
            .await
    }
}

#[async_trait]
impl FxRepositoryTrait for FxRepository {
    fn get_latest_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
        self.get_exchange_rates()
    }

    fn get_historical_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
        self.get_all_historical_exchange_rates()
    }

    fn get_latest_exchange_rate(&self, from: &str, to: &str) -> Result<Option<ExchangeRate>> {
        self.get_exchange_rate(from, to)
    }

    fn get_latest_exchange_rate_by_symbol(&self, symbol: &str) -> Result<Option<ExchangeRate>> {
        self.get_exchange_rate_by_id(symbol)
    }

    fn get_historical_quotes(
        &self,
        symbol: &str,
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
    ) -> Result<Vec<Quote>> {
        self.get_historical_quotes(symbol, start_date, end_date)
    }

    async fn add_quote(
        &self,
        symbol: String,
        date: String,
        rate: Decimal,
        source: String,
    ) -> Result<Quote> {
        self.add_quote(symbol, date, rate, source).await
    }

    async fn save_exchange_rate(&self, rate: ExchangeRate) -> Result<ExchangeRate> {
        self.save_exchange_rate(rate).await
    }

    async fn update_exchange_rate(&self, rate: &ExchangeRate) -> Result<ExchangeRate> {
        self.update_exchange_rate(rate).await
    }

    async fn delete_exchange_rate(&self, rate_id: &str) -> Result<()> {
        self.delete_exchange_rate(rate_id).await
    }

    async fn create_fx_asset(&self, from_currency: &str, to_currency: &str, source: &str) -> Result<()> {
        self.create_fx_asset(from_currency, to_currency, source).await
    }
}
