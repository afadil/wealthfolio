use chrono::Utc;
use log::debug;
use std::sync::Arc;

use crate::accounts::{Account, AccountServiceTrait};
use crate::activities::activities_constants::is_cash_activity;
use crate::activities::activities_errors::ActivityError;
use crate::activities::activities_model::*;
use crate::activities::{ActivityRepositoryTrait, ActivityServiceTrait};
use crate::assets::{canonical_asset_id, AssetKind, AssetServiceTrait};
use crate::fx::FxServiceTrait;
use crate::Result;
use uuid::Uuid;

/// Service for managing activities
pub struct ActivityService {
    activity_repository: Arc<dyn ActivityRepositoryTrait>,
    account_service: Arc<dyn AccountServiceTrait>,
    asset_service: Arc<dyn AssetServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

impl ActivityService {
    /// Creates a new ActivityService instance with injected dependencies
    pub fn new(
        activity_repository: Arc<dyn ActivityRepositoryTrait>,
        account_service: Arc<dyn AccountServiceTrait>,
        asset_service: Arc<dyn AssetServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        Self {
            activity_repository,
            account_service,
            asset_service,
            fx_service,
        }
    }
}

impl ActivityService {
    /// Resolves the asset_id for an activity.
    ///
    /// Priority:
    /// 1. If asset_id is provided, use it (backward compatibility, editing existing activities)
    /// 2. If symbol + exchange_mic are provided, generate canonical ID using canonical_asset_id()
    /// 3. For cash activities without symbol, generate CASH:{currency}
    /// 4. For non-cash activities without symbol, return error
    fn resolve_asset_id(
        &self,
        asset_id: Option<&str>,
        symbol: Option<&str>,
        exchange_mic: Option<&str>,
        asset_kind_hint: Option<&str>,
        activity_type: &str,
        currency: &str,
    ) -> Result<Option<String>> {
        // 1. If asset_id is explicitly provided, use it (backward compatibility for updates)
        if let Some(id) = asset_id {
            if !id.is_empty() {
                return Ok(Some(id.to_string()));
            }
        }

        // 2. If symbol is provided, generate canonical asset_id
        if let Some(sym) = symbol {
            if !sym.is_empty() {
                let kind = self.infer_asset_kind(sym, exchange_mic, asset_kind_hint);
                let generated_id = canonical_asset_id(&kind, sym, exchange_mic, currency);
                return Ok(Some(generated_id));
            }
        }

        // 3. For cash activities without symbol, generate CASH:{currency}
        if is_cash_activity(activity_type) {
            // Generate canonical CASH asset ID for cash activities
            let cash_id = canonical_asset_id(&AssetKind::Cash, currency, None, currency);
            return Ok(Some(cash_id));
        }

        // 4. For non-cash activities (BUY, SELL, DIVIDEND, etc.), we need either asset_id or symbol
        Err(ActivityError::InvalidData(
            "Non-cash activities require either asset_id or symbol to be provided".to_string(),
        )
        .into())
    }

    /// Infers the asset kind from symbol, exchange, and hints.
    fn infer_asset_kind(
        &self,
        symbol: &str,
        exchange_mic: Option<&str>,
        asset_kind_hint: Option<&str>,
    ) -> AssetKind {
        // 1. If explicit hint is provided, use it
        if let Some(hint) = asset_kind_hint {
            match hint.to_uppercase().as_str() {
                "SECURITY" => return AssetKind::Security,
                "CRYPTO" => return AssetKind::Crypto,
                "CASH" => return AssetKind::Cash,
                "FX_RATE" | "FX" => return AssetKind::FxRate,
                "OPTION" | "OPT" => return AssetKind::Option,
                "COMMODITY" | "CMDTY" => return AssetKind::Commodity,
                "PROPERTY" | "PROP" => return AssetKind::Property,
                "VEHICLE" | "VEH" => return AssetKind::Vehicle,
                "COLLECTIBLE" | "COLL" => return AssetKind::Collectible,
                "PHYSICAL_PRECIOUS" | "PREC" => return AssetKind::PhysicalPrecious,
                "PRIVATE_EQUITY" | "PEQ" => return AssetKind::PrivateEquity,
                "LIABILITY" | "LIAB" => return AssetKind::Liability,
                "OTHER" | "ALT" => return AssetKind::Other,
                _ => {} // Fall through to inference
            }
        }

        // 2. If exchange MIC is provided, it's a security
        if exchange_mic.is_some() {
            return AssetKind::Security;
        }

        // 3. Common crypto symbols heuristic
        let upper_symbol = symbol.to_uppercase();
        let common_crypto = [
            "BTC", "ETH", "XRP", "LTC", "BCH", "ADA", "DOT", "LINK", "XLM", "DOGE", "UNI", "SOL",
            "AVAX", "MATIC", "ATOM", "ALGO", "VET", "FIL", "TRX", "ETC", "XMR", "AAVE", "MKR",
            "COMP", "SNX", "YFI", "SUSHI", "CRV",
        ];
        if common_crypto.contains(&upper_symbol.as_str()) {
            return AssetKind::Crypto;
        }

        // 4. If symbol contains "-USD", "-CAD", etc., likely crypto
        if upper_symbol.contains("-USD")
            || upper_symbol.contains("-CAD")
            || upper_symbol.contains("-EUR")
            || upper_symbol.contains("-GBP")
        {
            return AssetKind::Crypto;
        }

        // 5. Default to Security (most common case)
        AssetKind::Security
    }

    async fn prepare_new_activity(&self, mut activity: NewActivity) -> Result<NewActivity> {
        let account: Account = self.account_service.get_account(&activity.account_id)?;

        // Determine currency (needed for asset ID generation)
        let currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account.currency.clone()
        };

        // For NEW activities: prioritize symbol over asset_id to ensure canonical ID generation.
        // This prevents clients from accidentally sending raw symbols (e.g., "AAPL") as asset_id.
        // If symbol is provided, ignore asset_id and generate canonical ID.
        let effective_asset_id = if activity.symbol.as_ref().is_some_and(|s| !s.is_empty()) {
            // Symbol is provided, ignore any asset_id and let resolve_asset_id generate canonical ID
            None
        } else {
            // No symbol provided, fall back to asset_id (backward compatibility for edge cases)
            activity.asset_id.as_deref()
        };

        // Resolve asset_id using canonical_asset_id() if symbol is provided
        let resolved_asset_id = self.resolve_asset_id(
            effective_asset_id,
            activity.symbol.as_deref(),
            activity.exchange_mic.as_deref(),
            activity.asset_kind.as_deref(),
            &activity.activity_type,
            &currency,
        )?;

        // Update activity with resolved asset_id
        activity.asset_id = resolved_asset_id.clone();

        // Process asset if asset_id is resolved
        if let Some(ref asset_id) = resolved_asset_id {
            let asset = self
                .asset_service
                .get_or_create_minimal_asset(
                    asset_id,
                    Some(currency.clone()),
                    activity.asset_metadata.clone(),
                )
                .await?;

            // Update asset pricing mode if specified
            if let Some(ref mode) = activity.pricing_mode {
                let requested_mode = mode.to_uppercase();
                let current_mode = asset.pricing_mode.as_db_str();
                if requested_mode != current_mode {
                    self.asset_service
                        .update_pricing_mode(&asset.id, &requested_mode)
                        .await?;
                }
            }

            if activity.currency.is_empty() {
                activity.currency = asset.currency.clone();
            }

            // Register FX pair for activity currency if different from account currency
            if activity.currency != account.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                    .await?;
            }

            // Register FX pair for asset currency if different from account currency
            // This is needed when the asset's native currency differs from the activity currency
            // (e.g., asset is EUR but activity was recorded in account's USD)
            if asset.currency != account.currency && asset.currency != activity.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), asset.currency.as_str())
                    .await?;
            }
        } else {
            // For pure cash movements without asset, just register FX if needed
            if activity.currency.is_empty() {
                activity.currency = account.currency.clone();
            }

            if activity.currency != account.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                    .await?;
            }
        }

        Ok(activity)
    }

    async fn prepare_update_activity(
        &self,
        mut activity: ActivityUpdate,
    ) -> Result<ActivityUpdate> {
        let account: Account = self.account_service.get_account(&activity.account_id)?;

        // Determine currency (needed for asset ID generation)
        let currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account.currency.clone()
        };

        // Resolve asset_id using canonical_asset_id() if symbol is provided
        let resolved_asset_id = self.resolve_asset_id(
            activity.asset_id.as_deref(),
            activity.symbol.as_deref(),
            activity.exchange_mic.as_deref(),
            activity.asset_kind.as_deref(),
            &activity.activity_type,
            &currency,
        )?;

        // Update activity with resolved asset_id
        activity.asset_id = resolved_asset_id.clone();

        // Process asset if asset_id is resolved
        if let Some(ref asset_id) = resolved_asset_id {
            // Updates don't carry asset metadata - pass None
            let asset = self
                .asset_service
                .get_or_create_minimal_asset(asset_id, Some(currency.clone()), None)
                .await?;

            // Update asset pricing mode if specified
            if let Some(ref mode) = activity.pricing_mode {
                let requested_mode = mode.to_uppercase();
                let current_mode = asset.pricing_mode.as_db_str();
                if requested_mode != current_mode {
                    self.asset_service
                        .update_pricing_mode(&asset.id, &requested_mode)
                        .await?;
                }
            }

            if activity.currency.is_empty() {
                activity.currency = asset.currency.clone();
            }

            // Register FX pair for activity currency if different from account currency
            if activity.currency != account.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                    .await?;
            }

            // Register FX pair for asset currency if different from account currency
            // This is needed when the asset's native currency differs from the activity currency
            // (e.g., asset is EUR but activity was recorded in account's USD)
            if asset.currency != account.currency && asset.currency != activity.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), asset.currency.as_str())
                    .await?;
            }
        } else {
            // For pure cash movements without asset, just register FX if needed
            if activity.currency.is_empty() {
                activity.currency = account.currency.clone();
            }

            if activity.currency != account.currency {
                self.fx_service
                    .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                    .await?;
            }
        }

        Ok(activity)
    }
}

#[async_trait::async_trait]
impl ActivityServiceTrait for ActivityService {
    fn get_activity(&self, activity_id: &str) -> Result<Activity> {
        self.activity_repository.get_activity(activity_id)
    }

    /// Retrieves all activities
    fn get_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_activities()
    }

    /// Retrieves activities by account ID
    fn get_activities_by_account_id(&self, account_id: &str) -> Result<Vec<Activity>> {
        self.activity_repository
            .get_activities_by_account_id(account_id)
    }

    /// Retrieves activities by account IDs
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>> {
        self.activity_repository
            .get_activities_by_account_ids(account_ids)
    }

    /// Retrieves all trading activities
    fn get_trading_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_trading_activities()
    }

    /// Retrieves all income activities
    fn get_income_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_income_activities()
    }

    /// Searches activities with various filters and pagination
    fn search_activities(
        &self,
        page: i64,
        page_size: i64,
        account_id_filter: Option<Vec<String>>,
        activity_type_filter: Option<Vec<String>>,
        asset_id_keyword: Option<String>,
        sort: Option<Sort>,
        needs_review_filter: Option<bool>,
    ) -> Result<ActivitySearchResponse> {
        self.activity_repository.search_activities(
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
            needs_review_filter,
        )
    }

    /// Creates a new activity
    async fn create_activity(&self, activity: NewActivity) -> Result<Activity> {
        let prepared = self.prepare_new_activity(activity).await?;
        self.activity_repository.create_activity(prepared).await
    }

    /// Updates an existing activity
    async fn update_activity(&self, activity: ActivityUpdate) -> Result<Activity> {
        let prepared = self.prepare_update_activity(activity).await?;
        self.activity_repository.update_activity(prepared).await
    }

    /// Deletes an activity
    async fn delete_activity(&self, activity_id: String) -> Result<Activity> {
        self.activity_repository.delete_activity(activity_id).await
    }

    async fn bulk_mutate_activities(
        &self,
        request: ActivityBulkMutationRequest,
    ) -> Result<ActivityBulkMutationResult> {
        let mut errors: Vec<ActivityBulkMutationError> = Vec::new();
        let mut prepared_creates: Vec<NewActivity> = Vec::new();
        let mut prepared_updates: Vec<ActivityUpdate> = Vec::new();
        let mut valid_delete_ids: Vec<String> = Vec::new();

        for new_activity in request.creates {
            let temp_id = new_activity.id.clone();
            match self.prepare_new_activity(new_activity).await {
                Ok(prepared) => prepared_creates.push(prepared),
                Err(err) => {
                    errors.push(ActivityBulkMutationError {
                        id: temp_id,
                        action: "create".to_string(),
                        message: err.to_string(),
                    });
                }
            }
        }

        for update_request in request.updates {
            let target_id = update_request.id.clone();
            match self.prepare_update_activity(update_request).await {
                Ok(prepared) => prepared_updates.push(prepared),
                Err(err) => {
                    errors.push(ActivityBulkMutationError {
                        id: Some(target_id),
                        action: "update".to_string(),
                        message: err.to_string(),
                    });
                }
            }
        }

        for delete_id in request.delete_ids {
            match self.activity_repository.get_activity(&delete_id) {
                Ok(_) => valid_delete_ids.push(delete_id.clone()),
                Err(err) => {
                    errors.push(ActivityBulkMutationError {
                        id: Some(delete_id),
                        action: "delete".to_string(),
                        message: err.to_string(),
                    });
                }
            }
        }

        if !errors.is_empty() {
            let outcome = ActivityBulkMutationResult {
                errors,
                ..Default::default()
            };
            return Ok(outcome);
        }

        let mut persisted = self
            .activity_repository
            .bulk_mutate_activities(prepared_creates, prepared_updates, valid_delete_ids)
            .await?;

        persisted.errors = errors;
        Ok(persisted)
    }

    /// Verifies the activities import from CSV file
    async fn check_activities_import(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>> {
        let account: Account = self.account_service.get_account(&account_id)?;

        let mut activities_with_status: Vec<ActivityImport> = Vec::new();

        for mut activity in activities {
            activity.id = Some(Uuid::new_v4().to_string());
            if activity.account_name.is_none() {
                activity.account_name = Some(account.name.clone());
            }
            if activity.account_id.is_none() {
                activity.account_id = Some(account_id.clone());
            }

            // Determine context currency for potential asset creation during check
            let asset_context_currency = if !activity.currency.is_empty() {
                activity.currency.clone()
            } else {
                // Fallback to account currency for context if import data lacks currency
                account.currency.clone()
            };

            // Generate canonical asset ID for the symbol
            // CSV imports don't include exchange info, so we infer kind and use UNKNOWN qualifier
            let inferred_kind =
                self.infer_asset_kind(&activity.symbol, None, None);
            let canonical_id = canonical_asset_id(
                &inferred_kind,
                &activity.symbol,
                None, // CSV imports don't have exchange MIC
                &asset_context_currency,
            );

            // CSV imports don't carry asset metadata - pass None
            let symbol_profile_result = self
                .asset_service
                .get_or_create_minimal_asset(&canonical_id, Some(asset_context_currency), None)
                .await;

            let (mut is_valid, mut error_message) = (true, None);

            match symbol_profile_result {
                Ok(asset) => {
                    // symbol_profile_result now returns Asset
                    activity.symbol_name = asset.name; // Use asset name

                    // Check if activity currency (from import) is valid and handle FX
                    if activity.currency.is_empty() {
                        // Activity must have a currency specified in the import
                        is_valid = false;
                        error_message =
                            Some("Activity currency is missing in the import data.".to_string());
                    } else if activity.currency != account.currency {
                        match self
                            .fx_service
                            .register_currency_pair(
                                account.currency.as_str(),
                                activity.currency.as_str(), // Use currency from import data
                            )
                            .await
                        {
                            Ok(_) => { /* FX pair registered or already exists */ }
                            Err(e) => {
                                is_valid = false;
                                error_message =
                                    Some(format!("Failed to register currency pair for FX: {}", e));
                            }
                        }
                    }
                }
                Err(e) => {
                    // Failed to get or create asset
                    let error_msg = format!(
                        "Failed to resolve asset for symbol '{}': {}",
                        &activity.symbol, e
                    );
                    is_valid = false;
                    error_message = Some(error_msg);
                }
            };

            activity.is_valid = is_valid;
            if let Some(error_msg) = error_message {
                let mut errors = std::collections::HashMap::new();
                errors.insert(activity.symbol.clone(), vec![error_msg]);
                activity.errors = Some(errors);
            }

            activities_with_status.push(activity);
        }

        Ok(activities_with_status)
    }

    /// Imports activities after validation
    async fn import_activities(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>> {
        let account = self.account_service.get_account(&account_id)?;

        let validated_activities = self
            .check_activities_import(account_id.clone(), activities)
            .await?;

        let has_errors = validated_activities.iter().any(|activity| {
            !activity.is_valid
                || activity
                    .errors
                    .as_ref()
                    .is_some_and(|errors| !errors.is_empty())
        });

        if has_errors {
            return Ok(validated_activities);
        }

        let new_activities: Vec<NewActivity> = validated_activities
            .iter()
            .map(|activity| {
                // Determine currency for canonical ID generation
                let currency = if !activity.currency.is_empty() {
                    &activity.currency
                } else {
                    &account.currency
                };

                // Generate canonical asset ID (same logic as check_activities_import)
                let inferred_kind = self.infer_asset_kind(&activity.symbol, None, None);
                let canonical_id = canonical_asset_id(
                    &inferred_kind,
                    &activity.symbol,
                    None, // CSV imports don't have exchange MIC
                    currency,
                );

                NewActivity {
                    id: activity.id.clone(),
                    account_id: activity.account_id.clone().unwrap_or_default(),
                    // Use the canonical asset ID generated above
                    asset_id: Some(canonical_id),
                    symbol: Some(activity.symbol.clone()),
                    exchange_mic: None, // CSV imports don't typically include exchange info
                    asset_kind: None,   // Already used for canonical ID generation
                    pricing_mode: None, // CSV imports default to MARKET pricing
                    asset_metadata: None, // CSV imports don't carry asset metadata
                    activity_type: activity.activity_type.clone(),
                    subtype: None,
                    activity_date: activity.date.clone(),
                    quantity: Some(activity.quantity),
                    unit_price: Some(activity.unit_price),
                    currency: activity.currency.clone(),
                    fee: Some(activity.fee),
                    amount: activity.amount,
                    status: if activity.is_draft {
                        Some(crate::activities::ActivityStatus::Draft)
                    } else {
                        Some(crate::activities::ActivityStatus::Posted)
                    },
                    notes: activity.comment.clone(),
                    fx_rate: None,
                    metadata: None,
                    needs_review: None,
                    source_system: Some("CSV".to_string()),
                    source_record_id: None,
                    source_group_id: None,
                }
            })
            .collect();

        let count = self
            .activity_repository
            .create_activities(new_activities)
            .await?;
        debug!("Successfully imported {} activities", count);

        Ok(validated_activities)
    }

    /// Gets the first activity date for given account IDs
    fn get_first_activity_date(
        &self,
        account_ids: Option<&[String]>,
    ) -> Result<Option<chrono::DateTime<Utc>>> {
        self.activity_repository
            .get_first_activity_date(account_ids)
    }

    /// Gets the import mapping for a given account ID
    fn get_import_mapping(&self, account_id: String) -> Result<ImportMappingData> {
        let mapping = self.activity_repository.get_import_mapping(&account_id)?;

        let mut result = match mapping {
            Some(m) => m.to_mapping_data().map_err(|e| {
                ActivityError::InvalidData(format!("Failed to parse mapping data: {}", e))
            })?,
            None => ImportMappingData::default(),
        };
        result.account_id = account_id;
        Ok(result)
    }

    /// Saves or updates an import mapping
    async fn save_import_mapping(
        &self,
        mapping_data: ImportMappingData,
    ) -> Result<ImportMappingData> {
        let mapping = ImportMapping::from_mapping_data(&mapping_data)?;
        self.activity_repository
            .save_import_mapping(&mapping)
            .await?;
        Ok(mapping_data)
    }
}
