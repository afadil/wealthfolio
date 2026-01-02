use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

use super::inflation_model::{InflationRate, NewInflationRate};
use super::inflation_traits::InflationRateRepositoryTrait;
use crate::db::{get_connection, WriteHandle};
use crate::errors::{Error, Result};
use crate::schema::inflation_rates;

pub struct InflationRateRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl InflationRateRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        InflationRateRepository { pool, writer }
    }

    fn get_inflation_rate_impl(&self, id_param: &str) -> Result<InflationRate> {
        let mut conn = get_connection(&self.pool)?;
        inflation_rates::table
            .find(id_param)
            .first(&mut conn)
            .map_err(Error::from)
    }

    fn get_inflation_rates_impl(&self) -> Result<Vec<InflationRate>> {
        let mut conn = get_connection(&self.pool)?;
        inflation_rates::table
            .order(inflation_rates::year.desc())
            .load(&mut conn)
            .map_err(Error::from)
    }

    fn get_inflation_rates_by_country_impl(&self, country_code: &str) -> Result<Vec<InflationRate>> {
        let mut conn = get_connection(&self.pool)?;
        inflation_rates::table
            .filter(inflation_rates::country_code.eq(country_code.to_uppercase()))
            .order(inflation_rates::year.desc())
            .load(&mut conn)
            .map_err(Error::from)
    }

    fn get_inflation_rate_for_year_impl(
        &self,
        country_code: &str,
        year: i32,
    ) -> Result<Option<InflationRate>> {
        let mut conn = get_connection(&self.pool)?;
        inflation_rates::table
            .filter(inflation_rates::country_code.eq(country_code.to_uppercase()))
            .filter(inflation_rates::year.eq(year))
            .first(&mut conn)
            .optional()
            .map_err(Error::from)
    }
}

#[async_trait]
impl InflationRateRepositoryTrait for InflationRateRepository {
    fn get_inflation_rate(&self, id_param: &str) -> Result<InflationRate> {
        self.get_inflation_rate_impl(id_param)
    }

    fn get_inflation_rates(&self) -> Result<Vec<InflationRate>> {
        self.get_inflation_rates_impl()
    }

    fn get_inflation_rates_by_country(&self, country_code: &str) -> Result<Vec<InflationRate>> {
        self.get_inflation_rates_by_country_impl(country_code)
    }

    fn get_inflation_rate_for_year(
        &self,
        country_code: &str,
        year: i32,
    ) -> Result<Option<InflationRate>> {
        self.get_inflation_rate_for_year_impl(country_code, year)
    }

    async fn create_inflation_rate(&self, new_rate: NewInflationRate) -> Result<InflationRate> {
        let new_rate_owned = new_rate.clone();

        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<InflationRate> {
                    let new_rate_record = (
                        inflation_rates::id.eq(Uuid::new_v4().to_string()),
                        inflation_rates::country_code.eq(new_rate_owned.country_code.to_uppercase()),
                        inflation_rates::year.eq(new_rate_owned.year),
                        inflation_rates::rate.eq(new_rate_owned.rate),
                        inflation_rates::reference_date.eq(new_rate_owned.reference_date),
                        inflation_rates::data_source.eq(new_rate_owned.data_source),
                        inflation_rates::created_at.eq(chrono::Utc::now().naive_utc()),
                        inflation_rates::updated_at.eq(chrono::Utc::now().naive_utc()),
                    );

                    diesel::insert_into(inflation_rates::table)
                        .values(new_rate_record)
                        .get_result(conn)
                        .map_err(Error::from)
                },
            )
            .await
    }

    async fn update_inflation_rate(
        &self,
        id_param: &str,
        updated_rate: NewInflationRate,
    ) -> Result<InflationRate> {
        let id_owned = id_param.to_string();
        let updated_rate_owned = updated_rate.clone();

        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<InflationRate> {
                    let target = inflation_rates::table.find(id_owned);
                    diesel::update(target)
                        .set((
                            inflation_rates::country_code
                                .eq(updated_rate_owned.country_code.to_uppercase()),
                            inflation_rates::year.eq(updated_rate_owned.year),
                            inflation_rates::rate.eq(updated_rate_owned.rate),
                            inflation_rates::reference_date.eq(updated_rate_owned.reference_date),
                            inflation_rates::data_source.eq(updated_rate_owned.data_source),
                            inflation_rates::updated_at.eq(chrono::Utc::now().naive_utc()),
                        ))
                        .get_result(conn)
                        .map_err(Error::from)
                },
            )
            .await
    }

    async fn delete_inflation_rate(&self, id_param: &str) -> Result<()> {
        let id_owned = id_param.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::delete(inflation_rates::table.find(id_owned))
                    .execute(conn)
                    .map_err(Error::from)
                    .map(|_| ())
            })
            .await
    }

    async fn upsert_inflation_rate(&self, rate: NewInflationRate) -> Result<InflationRate> {
        let rate_owned = rate.clone();
        let country_code_upper = rate_owned.country_code.to_uppercase();

        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<InflationRate> {
                    // Check if exists
                    let existing: Option<InflationRate> = inflation_rates::table
                        .filter(inflation_rates::country_code.eq(&country_code_upper))
                        .filter(inflation_rates::year.eq(rate_owned.year))
                        .first(conn)
                        .optional()
                        .map_err(Error::from)?;

                    if let Some(existing_rate) = existing {
                        // Update
                        diesel::update(inflation_rates::table.find(&existing_rate.id))
                            .set((
                                inflation_rates::rate.eq(rate_owned.rate),
                                inflation_rates::reference_date.eq(&rate_owned.reference_date),
                                inflation_rates::data_source.eq(&rate_owned.data_source),
                                inflation_rates::updated_at.eq(chrono::Utc::now().naive_utc()),
                            ))
                            .get_result(conn)
                            .map_err(Error::from)
                    } else {
                        // Insert
                        let new_rate_record = (
                            inflation_rates::id.eq(Uuid::new_v4().to_string()),
                            inflation_rates::country_code.eq(&country_code_upper),
                            inflation_rates::year.eq(rate_owned.year),
                            inflation_rates::rate.eq(rate_owned.rate),
                            inflation_rates::reference_date.eq(&rate_owned.reference_date),
                            inflation_rates::data_source.eq(&rate_owned.data_source),
                            inflation_rates::created_at.eq(chrono::Utc::now().naive_utc()),
                            inflation_rates::updated_at.eq(chrono::Utc::now().naive_utc()),
                        );

                        diesel::insert_into(inflation_rates::table)
                            .values(new_rate_record)
                            .get_result(conn)
                            .map_err(Error::from)
                    }
                },
            )
            .await
    }
}
