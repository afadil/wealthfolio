use chrono::Utc;
use log::debug;
use std::sync::Arc;

use crate::accounts::{Account, AccountServiceTrait};
use crate::activities::activities_errors::ActivityError;
use crate::activities::activities_model::*;
use crate::activities::{ActivityRepositoryTrait, ActivityServiceTrait};
use crate::assets::AssetServiceTrait;
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
    async fn prepare_new_activity(&self, mut activity: NewActivity) -> Result<NewActivity> {
        let account: Account = self.account_service.get_account(&activity.account_id)?;

        let asset_context_currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account.currency.clone()
        };

        let asset = self
            .asset_service
            .get_or_create_asset(&activity.asset_id, Some(asset_context_currency))
            .await?;

        if let Some(requested_source) = activity.asset_data_source.as_ref() {
            let requested = requested_source.to_uppercase();
            if !requested.is_empty() && asset.data_source.to_uppercase() != requested {
                self.asset_service
                    .update_asset_data_source(&asset.id, requested)
                    .await?;
            }
        }

        if activity.currency.is_empty() {
            activity.currency = asset.currency.clone();
        }

        if activity.currency != account.currency {
            self.fx_service
                .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                .await?;
        }

        Ok(activity)
    }

    async fn prepare_update_activity(
        &self,
        mut activity: ActivityUpdate,
    ) -> Result<ActivityUpdate> {
        let account: Account = self.account_service.get_account(&activity.account_id)?;

        let asset_context_currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account.currency.clone()
        };

        let asset = self
            .asset_service
            .get_or_create_asset(&activity.asset_id, Some(asset_context_currency))
            .await?;

        if let Some(requested_source) = activity.asset_data_source.as_ref() {
            let requested = requested_source.to_uppercase();
            if !requested.is_empty() && asset.data_source.to_uppercase() != requested {
                self.asset_service
                    .update_asset_data_source(&asset.id, requested)
                    .await?;
            }
        }

        if activity.currency.is_empty() {
            activity.currency = asset.currency.clone();
        }

        if activity.currency != account.currency {
            self.fx_service
                .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                .await?;
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
        is_draft_filter: Option<bool>,
    ) -> Result<ActivitySearchResponse> {
        self.activity_repository.search_activities(
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
            is_draft_filter,
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

            let symbol_profile_result = self
                .asset_service
                .get_or_create_asset(&activity.symbol, Some(asset_context_currency))
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
            .map(|activity| NewActivity {
                id: activity.id.clone(),
                account_id: activity.account_id.clone().unwrap_or_default(),
                asset_id: activity.symbol.clone(),
                asset_data_source: None,
                activity_type: activity.activity_type.clone(),
                activity_date: activity.date.clone(),
                quantity: Some(activity.quantity),
                unit_price: Some(activity.unit_price),
                currency: activity.currency.clone(),
                fee: Some(activity.fee),
                amount: activity.amount,
                is_draft: activity.is_draft,
                comment: activity.comment.clone(),
                fx_rate: None,
                provider_type: None,
                external_provider_id: None,
                external_broker_id: None,
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
