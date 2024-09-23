use crate::models::ExchangeRate;
use crate::schema::exchange_rates;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;

pub struct FxRepository;

impl FxRepository {
    pub fn get_exchange_rates(conn: &mut SqliteConnection) -> QueryResult<Vec<ExchangeRate>> {
        exchange_rates::table.load::<ExchangeRate>(conn)
    }

    pub fn get_exchange_rate(
        conn: &mut SqliteConnection,
        from: &str,
        to: &str,
    ) -> QueryResult<Option<ExchangeRate>> {
        let id = format!("{}{}=X", from, to);
        exchange_rates::table.find(id).first(conn).optional()
    }

    pub fn get_exchange_rate_by_id(
        conn: &mut SqliteConnection,
        id: &str,
    ) -> QueryResult<Option<ExchangeRate>> {
        exchange_rates::table.find(id).first(conn).optional()
    }

    pub fn upsert_exchange_rate(
        conn: &mut SqliteConnection,
        new_rate: ExchangeRate,
    ) -> QueryResult<ExchangeRate> {
        diesel::insert_into(exchange_rates::table)
            .values(&new_rate)
            .on_conflict(exchange_rates::id)
            .do_update()
            .set((
                exchange_rates::rate.eq(new_rate.rate),
                exchange_rates::source.eq(&new_rate.source.clone()),
                exchange_rates::updated_at.eq(chrono::Utc::now().naive_utc()),
            ))
            .get_result(conn)
    }

    pub fn update_exchange_rate(
        conn: &mut SqliteConnection,
        rate: &ExchangeRate,
    ) -> QueryResult<ExchangeRate> {
        diesel::update(exchange_rates::table.find(&rate.id))
            .set((
                exchange_rates::rate.eq(rate.rate),
                exchange_rates::source.eq(&rate.source),
                exchange_rates::updated_at.eq(chrono::Utc::now().naive_utc()),
            ))
            .get_result(conn)
    }

    // pub fn get_supported_currencies(conn: &mut SqliteConnection) -> QueryResult<Vec<String>> {
    //     use diesel::dsl::sql;
    //     use diesel::sql_types::Text;

    //     let currencies: Vec<String> = exchange_rates::table
    //         .select(sql::<Text>("DISTINCT substr(id, 1, 3)"))
    //         .load(conn)?;

    //     Ok(currencies)
    // }
}
