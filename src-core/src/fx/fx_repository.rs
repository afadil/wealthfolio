use crate::models::{ExchangeRate, NewExchangeRate};
use crate::schema::exchange_rates;
use chrono::Utc;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use uuid::Uuid;

pub struct FxRepository;

impl FxRepository {
    pub fn create(
        conn: &mut SqliteConnection,
        new_rate: NewExchangeRate,
    ) -> QueryResult<ExchangeRate> {
        let id = new_rate.id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().naive_utc();

        let rate = ExchangeRate {
            id,
            from_currency: new_rate.from_currency,
            to_currency: new_rate.to_currency,
            rate: new_rate.rate,
            source: new_rate.source,
            created_at: now,
            updated_at: now,
        };

        diesel::insert_into(exchange_rates::table)
            .values(&rate)
            .execute(conn)?;

        Ok(rate)
    }

    pub fn read(conn: &mut SqliteConnection, id: &str) -> QueryResult<ExchangeRate> {
        exchange_rates::table.find(id).first(conn)
    }

    pub fn read_by_currencies(
        conn: &mut SqliteConnection,
        from: &str,
        to: &str,
    ) -> QueryResult<ExchangeRate> {
        exchange_rates::table
            .filter(exchange_rates::from_currency.eq(from))
            .filter(exchange_rates::to_currency.eq(to))
            .first(conn)
    }

    pub fn update(
        conn: &mut SqliteConnection,
        id: &str,
        updated_rate: NewExchangeRate,
    ) -> QueryResult<ExchangeRate> {
        let now = Utc::now().naive_utc();

        diesel::update(exchange_rates::table.find(id))
            .set((
                exchange_rates::from_currency.eq(updated_rate.from_currency),
                exchange_rates::to_currency.eq(updated_rate.to_currency),
                exchange_rates::rate.eq(updated_rate.rate),
                exchange_rates::source.eq(updated_rate.source),
                exchange_rates::updated_at.eq(now),
            ))
            .get_result(conn)
    }

    pub fn delete(conn: &mut SqliteConnection, id: &str) -> QueryResult<usize> {
        diesel::delete(exchange_rates::table.find(id)).execute(conn)
    }

    pub fn list_all(conn: &mut SqliteConnection) -> QueryResult<Vec<ExchangeRate>> {
        exchange_rates::table.load::<ExchangeRate>(conn)
    }
}
