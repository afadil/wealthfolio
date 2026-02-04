use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use crate::{
    db::{get_connection, WriteHandle},
    schema::{asset_class_targets, holding_targets, rebalancing_strategies},
    Result,
};

use super::rebalancing_model::{
    AssetClassTarget, AssetClassTargetDB, HoldingTarget, HoldingTargetDB,
    NewAssetClassTarget, NewHoldingTarget, NewRebalancingStrategy, RebalancingStrategy,
    RebalancingStrategyDB,
};
use super::rebalancing_traits::RebalancingRepository;

pub struct RebalancingRepositoryImpl {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl RebalancingRepositoryImpl {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl RebalancingRepository for RebalancingRepositoryImpl {
    async fn get_strategies(&self) -> Result<Vec<RebalancingStrategy>> {
        let mut conn = get_connection(&self.pool)?;
        
        let strategies = rebalancing_strategies::table
            .load::<RebalancingStrategyDB>(&mut conn)?;
        
        Ok(strategies.into_iter().map(Into::into).collect())
    }

    async fn get_strategy(&self, id: &str) -> Result<Option<RebalancingStrategy>> {
        let mut conn = get_connection(&self.pool)?;
        
        let strategy = rebalancing_strategies::table
            .find(id)
            .first::<RebalancingStrategyDB>(&mut conn)
            .optional()?;
        
        Ok(strategy.map(Into::into))
    }

    async fn create_strategy(&self, strategy: NewRebalancingStrategy) -> Result<RebalancingStrategy> {
        strategy.validate()?;
        let db_strategy: RebalancingStrategyDB = strategy.into();
        
        self.writer
            .exec(move |conn| {
                diesel::insert_into(rebalancing_strategies::table)
                    .values(&db_strategy)
                    .execute(conn)?;
                
                let created = rebalancing_strategies::table
                    .find(&db_strategy.id)
                    .first::<RebalancingStrategyDB>(conn)?;
                
                Ok(created.into())
            })
            .await
    }

    async fn update_strategy(&self, strategy: NewRebalancingStrategy) -> Result<RebalancingStrategy> {
        strategy.validate()?;
        let id = strategy.id.clone().unwrap_or_default();
        let db_strategy: RebalancingStrategyDB = strategy.into();
        
        self.writer
            .exec(move |conn| {
                diesel::update(rebalancing_strategies::table.find(&id))
                    .set(&db_strategy)
                    .execute(conn)?;
                
                let updated = rebalancing_strategies::table
                    .find(&id)
                    .first::<RebalancingStrategyDB>(conn)?;
                
                Ok(updated.into())
            })
            .await
    }

    async fn delete_strategy(&self, id: &str) -> Result<()> {
        let id = id.to_string();
        
        self.writer
            .exec(move |conn| {
                diesel::delete(rebalancing_strategies::table.find(&id))
                    .execute(conn)?;
                Ok(())
            })
            .await
    }

    async fn get_asset_class_targets(&self, strategy_id: &str) -> Result<Vec<AssetClassTarget>> {
        let mut conn = get_connection(&self.pool)?;
        
        let targets = asset_class_targets::table
            .filter(asset_class_targets::strategy_id.eq(strategy_id))
            .load::<AssetClassTargetDB>(&mut conn)?;
        
        Ok(targets.into_iter().map(Into::into).collect())
    }

    async fn create_asset_class_target(&self, target: NewAssetClassTarget) -> Result<AssetClassTarget> {
        target.validate()?;
        let db_target: AssetClassTargetDB = target.into();
        
        self.writer
            .exec(move |conn| {
                diesel::insert_into(asset_class_targets::table)
                    .values(&db_target)
                    .execute(conn)?;
                
                let created = asset_class_targets::table
                    .find(&db_target.id)
                    .first::<AssetClassTargetDB>(conn)?;
                
                Ok(created.into())
            })
            .await
    }

    async fn update_asset_class_target(&self, target: NewAssetClassTarget) -> Result<AssetClassTarget> {
        target.validate()?;
        let id = target.id.clone().unwrap_or_default();
        let db_target: AssetClassTargetDB = target.into();
        
        self.writer
            .exec(move |conn| {
                diesel::update(asset_class_targets::table.find(&id))
                    .set(&db_target)
                    .execute(conn)?;
                
                let updated = asset_class_targets::table
                    .find(&id)
                    .first::<AssetClassTargetDB>(conn)?;
                
                Ok(updated.into())
            })
            .await
    }

    async fn delete_asset_class_target(&self, id: &str) -> Result<()> {
        let id = id.to_string();
        
        self.writer
            .exec(move |conn| {
                diesel::delete(asset_class_targets::table.find(&id))
                    .execute(conn)?;
                Ok(())
            })
            .await
    }

    async fn get_holding_targets(&self, asset_class_id: &str) -> Result<Vec<HoldingTarget>> {
        let mut conn = get_connection(&self.pool)?;
        
        let targets = holding_targets::table
            .filter(holding_targets::asset_class_id.eq(asset_class_id))
            .load::<HoldingTargetDB>(&mut conn)?;
        
        Ok(targets.into_iter().map(Into::into).collect())
    }

    async fn create_holding_target(&self, target: NewHoldingTarget) -> Result<HoldingTarget> {
        target.validate()?;
        let db_target: HoldingTargetDB = target.into();
        
        self.writer
            .exec(move |conn| {
                diesel::insert_into(holding_targets::table)
                    .values(&db_target)
                    .execute(conn)?;
                
                let created = holding_targets::table
                    .find(&db_target.id)
                    .first::<HoldingTargetDB>(conn)?;
                
                Ok(created.into())
            })
            .await
    }

    async fn update_holding_target(&self, target: NewHoldingTarget) -> Result<HoldingTarget> {
        target.validate()?;
        let id = target.id.clone().unwrap_or_default();
        let db_target: HoldingTargetDB = target.into();
        
        self.writer
            .exec(move |conn| {
                diesel::update(holding_targets::table.find(&id))
                    .set(&db_target)
                    .execute(conn)?;
                
                let updated = holding_targets::table
                    .find(&id)
                    .first::<HoldingTargetDB>(conn)?;
                
                Ok(updated.into())
            })
            .await
    }

    async fn delete_holding_target(&self, id: &str) -> Result<()> {
        let id = id.to_string();
        
        self.writer
            .exec(move |conn| {
                diesel::delete(holding_targets::table.find(&id))
                    .execute(conn)?;
                Ok(())
            })
            .await
    }
}
