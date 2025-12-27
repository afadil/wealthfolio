use crate::budget::budget_model::{
    BudgetAllocation, BudgetAllocationWithCategory, BudgetConfig, NewBudgetAllocation,
    NewBudgetConfig,
};
use crate::budget::budget_traits::BudgetRepositoryTrait;
use crate::db::{get_connection, WriteHandle};
use crate::errors::Result;
use crate::schema::{budget_allocations, budget_config, categories};
use async_trait::async_trait;
use chrono::Utc;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

pub struct BudgetRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl BudgetRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        BudgetRepository { pool, writer }
    }
}

#[async_trait]
impl BudgetRepositoryTrait for BudgetRepository {
    fn get_budget_config(&self) -> Result<Option<BudgetConfig>> {
        let mut conn = get_connection(&self.pool)?;
        let result = budget_config::table
            .first::<BudgetConfig>(&mut conn)
            .optional()?;
        Ok(result)
    }

    async fn upsert_budget_config(&self, config: NewBudgetConfig) -> Result<BudgetConfig> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<BudgetConfig> {
                let now = Utc::now().to_rfc3339();

                // Check if config already exists
                let existing: Option<BudgetConfig> = budget_config::table
                    .first::<BudgetConfig>(conn)
                    .optional()?;

                if let Some(existing_config) = existing {
                    // Update existing
                    diesel::update(budget_config::table.find(&existing_config.id))
                        .set((
                            budget_config::monthly_spending_target
                                .eq(&config.monthly_spending_target),
                            budget_config::monthly_income_target.eq(&config.monthly_income_target),
                            budget_config::currency.eq(&config.currency),
                            budget_config::updated_at.eq(&now),
                        ))
                        .execute(conn)?;

                    Ok(budget_config::table
                        .find(&existing_config.id)
                        .first::<BudgetConfig>(conn)?)
                } else {
                    // Insert new
                    let new_config = NewBudgetConfig {
                        id: Some(Uuid::new_v4().to_string()),
                        monthly_spending_target: config.monthly_spending_target,
                        monthly_income_target: config.monthly_income_target,
                        currency: config.currency,
                        created_at: Some(now.clone()),
                        updated_at: Some(now),
                    };

                    diesel::insert_into(budget_config::table)
                        .values(&new_config)
                        .execute(conn)?;

                    Ok(budget_config::table
                        .find(new_config.id.unwrap())
                        .first::<BudgetConfig>(conn)?)
                }
            })
            .await
    }

    async fn delete_budget_config(&self, config_id: &str) -> Result<usize> {
        let id_owned = config_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(budget_config::table.find(id_owned)).execute(conn)?)
            })
            .await
    }

    fn get_allocations(&self) -> Result<Vec<BudgetAllocation>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(budget_allocations::table.load::<BudgetAllocation>(&mut conn)?)
    }

    fn get_allocations_with_categories(&self) -> Result<Vec<BudgetAllocationWithCategory>> {
        let mut conn = get_connection(&self.pool)?;

        let results: Vec<(BudgetAllocation, String, Option<String>, i32)> =
            budget_allocations::table
                .inner_join(categories::table.on(categories::id.eq(budget_allocations::category_id)))
                .select((
                    budget_allocations::all_columns,
                    categories::name,
                    categories::color,
                    categories::is_income,
                ))
                .load(&mut conn)?;

        Ok(results
            .into_iter()
            .map(|(alloc, name, color, is_income)| {
                let amount = alloc.amount_decimal().to_string().parse().unwrap_or(0.0);
                BudgetAllocationWithCategory {
                    id: alloc.id,
                    category_id: alloc.category_id,
                    category_name: name,
                    category_color: color,
                    amount,
                    is_income: is_income == 1,
                }
            })
            .collect())
    }

    async fn upsert_allocation(&self, allocation: NewBudgetAllocation) -> Result<BudgetAllocation> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<BudgetAllocation> {
                let now = Utc::now().to_rfc3339();

                // Get the budget config id (should exist)
                let config: BudgetConfig = budget_config::table.first::<BudgetConfig>(conn)?;

                // Check if allocation for this category already exists
                let existing: Option<BudgetAllocation> = budget_allocations::table
                    .filter(budget_allocations::category_id.eq(&allocation.category_id))
                    .filter(budget_allocations::budget_config_id.eq(&config.id))
                    .first::<BudgetAllocation>(conn)
                    .optional()?;

                if let Some(existing_alloc) = existing {
                    // Update existing
                    diesel::update(budget_allocations::table.find(&existing_alloc.id))
                        .set((
                            budget_allocations::amount.eq(&allocation.amount),
                            budget_allocations::updated_at.eq(&now),
                        ))
                        .execute(conn)?;

                    Ok(budget_allocations::table
                        .find(&existing_alloc.id)
                        .first::<BudgetAllocation>(conn)?)
                } else {
                    // Insert new
                    let new_alloc = NewBudgetAllocation {
                        id: Some(Uuid::new_v4().to_string()),
                        budget_config_id: Some(config.id),
                        category_id: allocation.category_id,
                        amount: allocation.amount,
                        created_at: Some(now.clone()),
                        updated_at: Some(now),
                    };

                    diesel::insert_into(budget_allocations::table)
                        .values(&new_alloc)
                        .execute(conn)?;

                    Ok(budget_allocations::table
                        .find(new_alloc.id.unwrap())
                        .first::<BudgetAllocation>(conn)?)
                }
            })
            .await
    }

    async fn delete_allocation(&self, category_id: &str) -> Result<usize> {
        let category_id_owned = category_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(
                    budget_allocations::table
                        .filter(budget_allocations::category_id.eq(category_id_owned)),
                )
                .execute(conn)?)
            })
            .await
    }
}
