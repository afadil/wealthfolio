use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use crate::db::{get_connection, WriteHandle};
use crate::errors::Result;
use crate::schema::portfolios;
use crate::schema::portfolios::dsl::*;

use super::portfolio_model::{NewPortfolio, Portfolio, UpdatePortfolio};

/// Repository for managing portfolio data in the database
pub struct PortfolioRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl PortfolioRepository {
    /// Creates a new PortfolioRepository instance
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    /// Creates a new portfolio
    pub async fn create(&self, new_portfolio: NewPortfolio) -> Result<Portfolio> {
        new_portfolio.validate()?;

        let portfolio_id = new_portfolio
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let portfolio_name = new_portfolio.name.clone();
        let account_ids_json = new_portfolio.account_ids_json()?;

        self.writer
            .exec(move |conn| {
                let now = chrono::Utc::now().naive_utc();

                diesel::insert_into(portfolios::table)
                    .values((
                        id.eq(&portfolio_id),
                        name.eq(&portfolio_name),
                        account_ids.eq(&account_ids_json),
                        created_at.eq(now),
                        updated_at.eq(now),
                    ))
                    .execute(conn)?;

                portfolios::table
                    .find(&portfolio_id)
                    .first::<Portfolio>(conn)
                    .map_err(Into::into)
            })
            .await
    }

    /// Updates an existing portfolio
    pub async fn update(&self, update_portfolio: UpdatePortfolio) -> Result<Portfolio> {
        update_portfolio.validate()?;

        let portfolio_id = update_portfolio.id.clone();
        let portfolio_name = update_portfolio.name.clone();
        let account_ids_json = update_portfolio.account_ids_json()?;

        self.writer
            .exec(move |conn| {
                use crate::schema::portfolios::dsl::*;
                let now = chrono::Utc::now().naive_utc();

                // Build changeset based on what fields are provided
                if portfolio_name.is_some() && account_ids_json.is_some() {
                    diesel::update(portfolios.find(&portfolio_id))
                        .set((
                            name.eq(portfolio_name.unwrap()),
                            account_ids.eq(account_ids_json.unwrap()),
                            updated_at.eq(now),
                        ))
                        .execute(conn)?;
                } else if let Some(new_name) = portfolio_name {
                    diesel::update(portfolios.find(&portfolio_id))
                        .set((name.eq(new_name), updated_at.eq(now)))
                        .execute(conn)?;
                } else if let Some(new_account_ids) = account_ids_json {
                    diesel::update(portfolios.find(&portfolio_id))
                        .set((account_ids.eq(new_account_ids), updated_at.eq(now)))
                        .execute(conn)?;
                } else {
                    diesel::update(portfolios.find(&portfolio_id))
                        .set(updated_at.eq(now))
                        .execute(conn)?;
                }

                portfolios
                    .find(&portfolio_id)
                    .first::<Portfolio>(conn)
                    .map_err(Into::into)
            })
            .await
    }

    /// Retrieves a portfolio by its ID
    pub fn get_by_id(&self, portfolio_id: &str) -> Result<Portfolio> {
        let mut conn = get_connection(&self.pool)?;

        portfolios::table
            .find(portfolio_id)
            .first::<Portfolio>(&mut conn)
            .map_err(Into::into)
    }

    /// Lists all portfolios
    pub fn list(&self) -> Result<Vec<Portfolio>> {
        let mut conn = get_connection(&self.pool)?;

        portfolios::table
            .order(name.asc())
            .load::<Portfolio>(&mut conn)
            .map_err(Into::into)
    }

    /// Deletes a portfolio by its ID
    pub async fn delete(&self, portfolio_id: String) -> Result<()> {
        self.writer
            .exec(move |conn| {
                diesel::delete(portfolios::table.find(&portfolio_id)).execute(conn)?;
                Ok(())
            })
            .await
    }

    /// Checks if a portfolio name already exists (for validation)
    pub fn name_exists(&self, portfolio_name: &str, exclude_id: Option<&str>) -> Result<bool> {
        let mut conn = get_connection(&self.pool)?;

        let mut query = portfolios::table
            .filter(name.eq(portfolio_name))
            .into_boxed();

        if let Some(id_to_exclude) = exclude_id {
            query = query.filter(id.ne(id_to_exclude));
        }

        let count: i64 = query.count().get_result(&mut conn)?;

        Ok(count > 0)
    }
}
