//! Custom asset logo service.
//!
//! Sibling of `AlternativeAssetService`: validates the uploaded PNG and
//! persists through `AssetLogoRepositoryTrait`.
//! No domain event is emitted; the frontend refreshes its logo index on the
//! existing `portfolio:update-complete` signal.

use std::sync::Arc;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use chrono::Utc;

use super::asset_logo_model::{
    decode_and_validate, AssetLogo, AssetLogoSummary, UpsertAssetLogo, ASSET_LOGO_MIME_PNG,
};
use super::asset_logo_traits::{AssetLogoRepositoryTrait, AssetLogoServiceTrait};
use super::AssetRepositoryTrait;
use crate::errors::Result;

pub struct AssetLogoService {
    logo_repository: Arc<dyn AssetLogoRepositoryTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
}

impl AssetLogoService {
    pub fn new(
        logo_repository: Arc<dyn AssetLogoRepositoryTrait>,
        asset_repository: Arc<dyn AssetRepositoryTrait>,
    ) -> Self {
        Self {
            logo_repository,
            asset_repository,
        }
    }
}

#[async_trait]
impl AssetLogoServiceTrait for AssetLogoService {
    fn get_asset_logo(&self, asset_id: &str) -> Result<Option<AssetLogo>> {
        self.logo_repository.get(asset_id)
    }

    fn list_asset_logos(&self) -> Result<Vec<AssetLogoSummary>> {
        self.logo_repository.list_summaries()
    }

    async fn upsert_asset_logo(
        &self,
        asset_id: &str,
        payload: UpsertAssetLogo,
    ) -> Result<AssetLogo> {
        // Asset must exist (NotFound propagates).
        self.asset_repository.get_by_id(asset_id)?;

        let validated = decode_and_validate(&payload.data_base64)?;
        // Re-encode so the stored form is canonical (padded, no data: prefix).
        let data_base64 = BASE64_STANDARD.encode(&validated.bytes);

        let now = Utc::now().to_rfc3339();
        self.logo_repository
            .upsert(AssetLogo {
                asset_id: asset_id.to_string(),
                mime_type: ASSET_LOGO_MIME_PNG.to_string(),
                data_base64,
                sha256: validated.sha256_hex,
                width: validated.width as i32,
                height: validated.height as i32,
                created_at: now.clone(),
                updated_at: now,
            })
            .await
    }

    async fn delete_asset_logo(&self, asset_id: &str) -> Result<()> {
        self.logo_repository.delete(asset_id).await?;
        Ok(())
    }
}
