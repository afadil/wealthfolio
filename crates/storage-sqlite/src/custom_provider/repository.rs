use async_trait::async_trait;
use diesel::prelude::*;
use log::warn;
use std::sync::Arc;

use crate::db::{get_connection, DbPool, WriteHandle};
use crate::errors::{IntoCore, StorageError};
use crate::schema::market_data_providers;

use wealthfolio_core::custom_provider::{
    CustomProviderRepository, CustomProviderSource, CustomProviderWithSources,
    NewCustomProviderSource,
};
use wealthfolio_core::errors::Result;
use wealthfolio_core::quotes::provider_settings::MarketDataProviderSetting;

/// JSON wrapper stored in market_data_providers.config
#[derive(serde::Serialize, serde::Deserialize, Default)]
struct ProviderConfig {
    sources: Vec<NewCustomProviderSource>,
}

pub struct CustomProviderSqliteRepository {
    pool: Arc<DbPool>,
    writer: WriteHandle,
}

impl CustomProviderSqliteRepository {
    pub fn new(pool: Arc<DbPool>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }
}

/// Parse the config JSON column into sources, converting NewCustomProviderSource → CustomProviderSource.
fn parse_sources(config_json: Option<&str>, provider_id: &str) -> Vec<CustomProviderSource> {
    let config: ProviderConfig = match config_json {
        Some(s) => match serde_json::from_str(s) {
            Ok(c) => c,
            Err(e) => {
                warn!(
                    "Failed to parse config JSON for provider '{}': {}",
                    provider_id, e
                );
                ProviderConfig::default()
            }
        },
        None => ProviderConfig::default(),
    };

    config
        .sources
        .into_iter()
        .map(|s| CustomProviderSource {
            id: format!("{}:{}", provider_id, s.kind),
            provider_id: provider_id.to_string(),
            kind: s.kind,
            format: s.format,
            url: s.url,
            price_path: s.price_path,
            date_path: s.date_path,
            date_format: s.date_format,
            currency_path: s.currency_path,
            factor: s.factor,
            invert: s.invert,
            locale: s.locale,
            headers: s.headers,
            high_path: s.high_path,
            low_path: s.low_path,
            volume_path: s.volume_path,
            default_price: s.default_price,
            date_timezone: s.date_timezone,
        })
        .collect()
}

fn sources_to_config_json(sources: &[NewCustomProviderSource]) -> String {
    let config = ProviderConfig {
        sources: sources.to_vec(),
    };
    serde_json::to_string(&config).unwrap_or_else(|_| r#"{"sources":[]}"#.to_string())
}

#[async_trait]
impl CustomProviderRepository for CustomProviderSqliteRepository {
    fn get_all(&self) -> Result<Vec<CustomProviderWithSources>> {
        let mut conn = get_connection(&self.pool)?;

        let providers: Vec<(String, String, String, bool, i32, Option<String>)> =
            market_data_providers::table
                .filter(market_data_providers::provider_type.eq("custom"))
                .select((
                    market_data_providers::id,
                    market_data_providers::name,
                    market_data_providers::description,
                    market_data_providers::enabled,
                    market_data_providers::priority,
                    market_data_providers::config,
                ))
                .load(&mut conn)
                .into_core()?;

        Ok(providers
            .into_iter()
            .map(|(id, name, description, enabled, priority, config)| {
                let sources = parse_sources(config.as_deref(), &id);
                CustomProviderWithSources {
                    id,
                    name,
                    description,
                    enabled,
                    priority,
                    sources,
                }
            })
            .collect())
    }

    fn get_source_by_kind(
        &self,
        provider_id: &str,
        kind: &str,
    ) -> Result<Option<CustomProviderSource>> {
        let mut conn = get_connection(&self.pool)?;

        let row: Option<(bool, Option<String>)> = market_data_providers::table
            .find(provider_id)
            .select((
                market_data_providers::enabled,
                market_data_providers::config,
            ))
            .first(&mut conn)
            .optional()
            .into_core()?;

        match row {
            Some((true, config)) => {
                let sources = parse_sources(config.as_deref(), provider_id);
                Ok(sources.into_iter().find(|s| s.kind == kind))
            }
            _ => Ok(None),
        }
    }

    async fn create(
        &self,
        provider: &MarketDataProviderSetting,
        sources: &[NewCustomProviderSource],
    ) -> Result<()> {
        let provider = provider.clone();
        let config_json = sources_to_config_json(sources);

        self.writer
            .exec_tx(move |tx| {
                diesel::insert_into(market_data_providers::table)
                    .values((
                        market_data_providers::id.eq(&provider.id),
                        market_data_providers::name.eq(&provider.name),
                        market_data_providers::description.eq(&provider.description),
                        market_data_providers::url.eq(&provider.url),
                        market_data_providers::priority.eq(provider.priority),
                        market_data_providers::enabled.eq(provider.enabled),
                        market_data_providers::provider_type
                            .eq(provider.provider_type.as_deref().unwrap_or("custom")),
                        market_data_providers::config.eq(&config_json),
                    ))
                    .execute(tx.conn())
                    .map_err(StorageError::QueryFailed)?;
                Ok(())
            })
            .await
    }

    async fn update_provider(&self, provider: &MarketDataProviderSetting) -> Result<()> {
        let provider = provider.clone();
        self.writer
            .exec_tx(move |tx| {
                diesel::update(
                    market_data_providers::table
                        .find(&provider.id)
                        .filter(market_data_providers::provider_type.eq("custom")),
                )
                .set((
                    market_data_providers::name.eq(&provider.name),
                    market_data_providers::description.eq(&provider.description),
                    market_data_providers::priority.eq(provider.priority),
                    market_data_providers::enabled.eq(provider.enabled),
                ))
                .execute(tx.conn())
                .map_err(StorageError::QueryFailed)?;
                Ok(())
            })
            .await
    }

    async fn update_sources(
        &self,
        provider_id: &str,
        sources: &[NewCustomProviderSource],
    ) -> Result<()> {
        let provider_id = provider_id.to_string();
        let config_json = sources_to_config_json(sources);

        self.writer
            .exec_tx(move |tx| {
                diesel::update(
                    market_data_providers::table
                        .find(&provider_id)
                        .filter(market_data_providers::provider_type.eq("custom")),
                )
                .set(market_data_providers::config.eq(&config_json))
                .execute(tx.conn())
                .map_err(StorageError::QueryFailed)?;
                Ok(())
            })
            .await
    }

    async fn delete(&self, provider_id: &str) -> Result<()> {
        let provider_id = provider_id.to_string();
        self.writer
            .exec_tx(move |tx| {
                diesel::delete(market_data_providers::table.find(&provider_id))
                    .execute(tx.conn())
                    .map_err(StorageError::QueryFailed)?;
                Ok(())
            })
            .await
    }

    fn get_asset_count_for_provider(&self, provider_code: &str) -> Result<i64> {
        use diesel::sql_types::{BigInt, Text};

        let mut conn = get_connection(&self.pool)?;

        #[derive(QueryableByName)]
        struct CountRow {
            #[diesel(sql_type = BigInt)]
            cnt: i64,
        }

        // Check both custom_provider_code and symbol-mapping overrides (CUSTOM:<code>)
        // Escape LIKE metacharacters in provider_code to prevent false matches
        let escaped_code = provider_code.replace('%', "\\%").replace('_', "\\_");
        let override_pattern = format!("%\"CUSTOM:{}\":%", escaped_code);
        let row: CountRow = diesel::sql_query(
            "SELECT COUNT(*) as cnt FROM assets WHERE \
             json_extract(provider_config, '$.custom_provider_code') = ?1 \
             OR provider_config LIKE ?2 ESCAPE '\\'",
        )
        .bind::<Text, _>(provider_code)
        .bind::<Text, _>(&override_pattern)
        .get_result(&mut conn)
        .into_core()?;

        Ok(row.cnt)
    }
}
