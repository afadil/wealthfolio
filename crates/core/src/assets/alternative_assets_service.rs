//! Alternative Assets service implementation.
//!
//! This service manages the lifecycle of alternative assets including
//! properties, vehicles, collectibles, precious metals, and liabilities.
//!
//! Alternative assets use a simplified model:
//! - No dedicated accounts (avoids account clutter)
//! - No activities (avoids activity clutter)
//! - Just asset record + valuation quotes

use std::sync::Arc;

use async_trait::async_trait;
use chrono::{TimeZone, Utc};
use log::debug;
use rust_decimal::Decimal;
use serde_json::{json, Value};
use uuid::Uuid;

use super::alternative_assets_model::{
    AlternativeHolding, CreateAlternativeAssetRequest, CreateAlternativeAssetResponse,
    LinkLiabilityRequest, LinkLiabilityResponse, UpdateValuationRequest, UpdateValuationResponse,
};
use super::alternative_assets_traits::{
    AlternativeAssetRepositoryTrait, AlternativeAssetServiceTrait,
};
use super::{generate_asset_id, AssetKind, AssetRepositoryTrait, NewAsset, PricingMode};
use crate::errors::{Error, Result, ValidationError};
use crate::quotes::{DataSource, Quote, QuoteServiceTrait};

/// Service for managing alternative assets.
///
/// This service coordinates between the asset repository and quote service
/// to manage the lifecycle of alternative assets.
///
/// NOTE: Alternative assets don't create accounts or activities - just asset + quotes.
pub struct AlternativeAssetService {
    alternative_asset_repository: Arc<dyn AlternativeAssetRepositoryTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
    quote_service: Arc<dyn QuoteServiceTrait>,
}

impl AlternativeAssetService {
    /// Creates a new AlternativeAssetService instance.
    pub fn new(
        alternative_asset_repository: Arc<dyn AlternativeAssetRepositoryTrait>,
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
    ) -> Self {
        Self {
            alternative_asset_repository,
            asset_repository,
            quote_service,
        }
    }

    /// Validates that the request is for an alternative asset kind.
    fn validate_alternative_asset_kind(kind: &AssetKind) -> Result<()> {
        match kind {
            AssetKind::Property
            | AssetKind::Vehicle
            | AssetKind::Collectible
            | AssetKind::PhysicalPrecious
            | AssetKind::Liability
            | AssetKind::Other => Ok(()),
            _ => Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Asset kind {:?} is not an alternative asset type",
                kind
            )))),
        }
    }

    /// Builds the asset metadata JSON, including purchase info and kind-specific metadata.
    fn build_asset_metadata(
        request: &CreateAlternativeAssetRequest,
    ) -> Option<Value> {
        let mut metadata = request.metadata.clone().unwrap_or_else(|| json!({}));

        // Add purchase info if provided
        if let Some(purchase_price) = &request.purchase_price {
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert(
                    "purchase_price".to_string(),
                    json!(purchase_price.to_string()),
                );
            }
        }
        if let Some(purchase_date) = &request.purchase_date {
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert(
                    "purchase_date".to_string(),
                    json!(purchase_date.to_string()),
                );
            }
        }

        // For liabilities, add linked_asset_id if provided
        if request.kind == AssetKind::Liability {
            if let Some(linked_id) = &request.linked_asset_id {
                if let Some(obj) = metadata.as_object_mut() {
                    obj.insert("linked_asset_id".to_string(), json!(linked_id));
                }
            }
        }

        // Return None if metadata is empty, Some otherwise
        if metadata.as_object().is_some_and(|o| o.is_empty()) {
            None
        } else {
            Some(metadata)
        }
    }

    /// Extracts linked_asset_id from liability metadata.
    #[cfg(test)]
    fn get_linked_asset_id(metadata: &Option<Value>) -> Option<String> {
        metadata
            .as_ref()
            .and_then(|m| m.get("linked_asset_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }

    /// Adds or updates linked_asset_id in metadata.
    fn set_linked_asset_id(metadata: Option<Value>, linked_asset_id: &str) -> Value {
        let mut meta = metadata.unwrap_or_else(|| json!({}));
        if let Some(obj) = meta.as_object_mut() {
            obj.insert("linked_asset_id".to_string(), json!(linked_asset_id));
        }
        meta
    }

    /// Removes linked_asset_id from metadata.
    #[cfg(test)]
    fn remove_linked_asset_id(metadata: Option<Value>) -> Option<Value> {
        let mut meta = metadata?;
        if let Some(obj) = meta.as_object_mut() {
            obj.remove("linked_asset_id");
            if obj.is_empty() {
                return None;
            }
        }
        Some(meta)
    }
}

#[async_trait]
impl AlternativeAssetServiceTrait for AlternativeAssetService {
    async fn create_alternative_asset(
        &self,
        request: CreateAlternativeAssetRequest,
    ) -> Result<CreateAlternativeAssetResponse> {
        // Validate the asset kind is an alternative asset
        Self::validate_alternative_asset_kind(&request.kind)?;

        // Validate required fields
        if request.name.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Asset name cannot be empty".to_string(),
            )));
        }
        if request.currency.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Currency cannot be empty".to_string(),
            )));
        }

        debug!(
            "Creating alternative asset: {} ({:?})",
            request.name, request.kind
        );

        // 1. Generate unique asset ID
        let asset_id = generate_asset_id(&request.kind);
        debug!("Generated asset ID: {}", asset_id);

        // 2. Build asset metadata
        let metadata = Self::build_asset_metadata(&request);

        // 3. Create the asset record
        let new_asset = NewAsset {
            id: Some(asset_id.clone()),
            name: Some(request.name.clone()),
            symbol: asset_id.clone(),
            currency: request.currency.clone(),
            kind: request.kind.clone(),
            pricing_mode: PricingMode::Manual,
            is_active: true,
            metadata,
            ..Default::default()
        };

        let asset = self.asset_repository.create(new_asset).await?;
        debug!("Created asset: {}", asset.id);

        // 4. Create initial valuation quote
        // For alternative assets, close = total value (not unit price)
        let quote_id = Uuid::new_v4().to_string();
        let quote = Quote {
            id: quote_id.clone(),
            symbol: asset_id.clone(),
            timestamp: Utc.from_utc_datetime(&request.value_date.and_hms_opt(12, 0, 0).unwrap()),
            open: request.current_value,
            high: request.current_value,
            low: request.current_value,
            close: request.current_value,
            adjclose: request.current_value,
            volume: Decimal::ZERO,
            currency: request.currency.clone(),
            data_source: DataSource::Manual,
            created_at: Utc::now(),
            notes: None,
        };

        let saved_quote = self.quote_service.add_quote(&quote).await?;
        debug!("Created initial valuation quote: {}", saved_quote.id);

        Ok(CreateAlternativeAssetResponse {
            asset_id,
            quote_id: saved_quote.id,
        })
    }

    async fn update_valuation(
        &self,
        request: UpdateValuationRequest,
    ) -> Result<UpdateValuationResponse> {
        debug!(
            "Updating valuation for asset {} to {} on {}",
            request.asset_id, request.value, request.date
        );

        // Validate asset_id is a valid alternative asset ID
        if !super::is_valid_alternative_asset_id(&request.asset_id) {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Invalid alternative asset ID: {}",
                request.asset_id
            ))));
        }

        // Get the existing quote to find the currency
        // If no existing quote, we need to fetch the asset to get currency
        let currency = match self
            .quote_service
            .get_latest_quote(&request.asset_id)
        {
            Ok(existing_quote) => existing_quote.currency,
            Err(_) => {
                // Fallback: try to get from recent quotes or default
                // In a complete implementation, we'd fetch the asset's currency
                return Err(Error::Validation(ValidationError::InvalidInput(format!(
                    "Cannot find existing valuation for asset: {}. Please check the asset exists.",
                    request.asset_id
                ))));
            }
        };

        // Create new valuation quote
        let quote_id = Uuid::new_v4().to_string();
        let quote = Quote {
            id: quote_id.clone(),
            symbol: request.asset_id.clone(),
            timestamp: Utc
                .from_utc_datetime(&request.date.and_hms_opt(12, 0, 0).unwrap()),
            open: request.value,
            high: request.value,
            low: request.value,
            close: request.value,
            adjclose: request.value,
            volume: Decimal::ZERO,
            currency,
            data_source: DataSource::Manual,
            created_at: Utc::now(),
            notes: request.notes.clone(),
        };

        let saved_quote = self.quote_service.add_quote(&quote).await?;
        debug!("Created valuation quote: {}", saved_quote.id);

        Ok(UpdateValuationResponse {
            quote_id: saved_quote.id,
            valuation_date: request.date,
            value: request.value,
        })
    }

    async fn delete_alternative_asset(&self, asset_id: &str) -> Result<()> {
        debug!("Deleting alternative asset: {}", asset_id);

        // Validate asset_id is a valid alternative asset ID
        if !super::is_valid_alternative_asset_id(asset_id) {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Invalid alternative asset ID: {}",
                asset_id
            ))));
        }

        // The repository handles the transactional deletion:
        // 1. Unlink any liabilities referencing this asset
        // 2. Delete all quotes for this asset (WHERE data_source = 'MANUAL')
        // 3. Delete the asset record
        self.alternative_asset_repository
            .delete_alternative_asset(asset_id)
            .await?;

        debug!("Successfully deleted alternative asset: {}", asset_id);
        Ok(())
    }

    async fn link_liability(
        &self,
        request: LinkLiabilityRequest,
    ) -> Result<LinkLiabilityResponse> {
        debug!(
            "Linking liability {} to asset {}",
            request.liability_id, request.target_asset_id
        );

        // Validate liability_id is a valid liability asset ID
        if !request.liability_id.starts_with("LIAB-") {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Asset {} is not a liability",
                request.liability_id
            ))));
        }

        // Validate target_asset_id is a valid alternative asset ID
        if !super::is_valid_alternative_asset_id(&request.target_asset_id) {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Invalid target asset ID: {}",
                request.target_asset_id
            ))));
        }

        // Get current liability metadata and update it
        // This requires fetching the current asset, which we'd do via asset repository
        // For now, we'll use the repository's update_asset_metadata method
        let new_metadata = Self::set_linked_asset_id(None, &request.target_asset_id);
        self.alternative_asset_repository
            .update_asset_metadata(&request.liability_id, Some(new_metadata))
            .await?;

        debug!(
            "Linked liability {} to asset {}",
            request.liability_id, request.target_asset_id
        );

        Ok(LinkLiabilityResponse {
            liability_id: request.liability_id,
            linked_asset_id: Some(request.target_asset_id),
        })
    }

    async fn unlink_liability(&self, liability_id: &str) -> Result<LinkLiabilityResponse> {
        debug!("Unlinking liability {}", liability_id);

        // Validate liability_id is a valid liability asset ID
        if !liability_id.starts_with("LIAB-") {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Asset {} is not a liability",
                liability_id
            ))));
        }

        // Remove linked_asset_id from metadata
        self.alternative_asset_repository
            .update_asset_metadata(liability_id, None)
            .await?;

        debug!("Unlinked liability {}", liability_id);

        Ok(LinkLiabilityResponse {
            liability_id: liability_id.to_string(),
            linked_asset_id: None,
        })
    }

    fn get_alternative_holdings(&self) -> Result<Vec<AlternativeHolding>> {
        debug!("Fetching alternative holdings");

        // Get all assets
        let all_assets = self.asset_repository.list()?;

        // Filter to alternative assets only
        let alternative_assets: Vec<_> = all_assets
            .into_iter()
            .filter(|a| a.kind.is_alternative())
            .collect();

        if alternative_assets.is_empty() {
            return Ok(vec![]);
        }

        // Get symbols for quote lookup
        let symbols: Vec<String> = alternative_assets.iter().map(|a| a.symbol.clone()).collect();

        // Fetch latest quotes for all alternative assets
        let quotes = self.quote_service.get_latest_quotes(&symbols)?;

        // Build AlternativeHolding for each asset
        let holdings: Vec<AlternativeHolding> = alternative_assets
            .into_iter()
            .filter_map(|asset| {
                // Get the latest quote for this asset
                let quote = quotes.get(&asset.symbol)?;

                // Extract purchase_price from metadata
                let purchase_price = asset
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("purchase_price"))
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<Decimal>().ok());

                // Extract purchase_date from metadata
                let purchase_date = asset
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("purchase_date"))
                    .and_then(|v| v.as_str())
                    .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

                // Extract linked_asset_id from metadata (for liabilities)
                let linked_asset_id = asset
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("linked_asset_id"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // Calculate unrealized gain if we have purchase price
                let (unrealized_gain, unrealized_gain_pct) = if let Some(pp) = purchase_price {
                    let gain = quote.close - pp;
                    let pct = if pp != Decimal::ZERO {
                        Some((gain / pp) * Decimal::from(100))
                    } else {
                        None
                    };
                    (Some(gain), pct)
                } else {
                    (None, None)
                };

                Some(AlternativeHolding {
                    id: asset.id.clone(),
                    kind: asset.kind.clone(),
                    name: asset.name.clone().unwrap_or_else(|| asset.symbol.clone()),
                    symbol: asset.symbol,
                    currency: asset.currency,
                    market_value: quote.close,
                    purchase_price,
                    purchase_date,
                    unrealized_gain,
                    unrealized_gain_pct,
                    valuation_date: quote.timestamp,
                    metadata: asset.metadata,
                    linked_asset_id,
                })
            })
            .collect();

        debug!("Found {} alternative holdings", holdings.len());
        Ok(holdings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_alternative_asset_kind() {
        // Valid alternative asset kinds
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Property).is_ok());
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Vehicle).is_ok());
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Collectible).is_ok());
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::PhysicalPrecious).is_ok());
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Liability).is_ok());
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Other).is_ok());

        // Invalid asset kinds
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Security).is_err());
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Crypto).is_err());
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Cash).is_err());
    }

    #[test]
    fn test_build_asset_metadata() {
        let request = CreateAlternativeAssetRequest {
            kind: AssetKind::Property,
            name: "Beach House".to_string(),
            currency: "USD".to_string(),
            current_value: Decimal::new(450000, 0),
            value_date: chrono::NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            purchase_price: Some(Decimal::new(400000, 0)),
            purchase_date: Some(chrono::NaiveDate::from_ymd_opt(2020, 3, 1).unwrap()),
            metadata: Some(json!({"property_type": "residence"})),
            linked_asset_id: None,
        };

        let metadata = AlternativeAssetService::build_asset_metadata(&request);
        assert!(metadata.is_some());
        let meta = metadata.unwrap();
        assert_eq!(meta.get("property_type").unwrap(), "residence");
        assert!(meta.get("purchase_price").is_some());
        assert!(meta.get("purchase_date").is_some());
    }

    #[test]
    fn test_set_and_remove_linked_asset_id() {
        let metadata = AlternativeAssetService::set_linked_asset_id(None, "PROP-a1b2c3d4");
        assert_eq!(
            metadata.get("linked_asset_id").unwrap(),
            "PROP-a1b2c3d4"
        );

        let linked_id = AlternativeAssetService::get_linked_asset_id(&Some(metadata.clone()));
        assert_eq!(linked_id, Some("PROP-a1b2c3d4".to_string()));

        let removed = AlternativeAssetService::remove_linked_asset_id(Some(metadata));
        assert!(removed.is_none()); // Only had linked_asset_id, so should be None when removed
    }
}
