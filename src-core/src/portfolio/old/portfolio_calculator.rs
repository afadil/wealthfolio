use crate::accounts::Account;
use crate::activities::{Activity, ActivityType}; // Ensure ActivityType is imported if defined elsewhere, or define locally
use crate::assets::{Asset, AssetService};
use crate::errors::{Error, Result, ValidationError};
use crate::models::{Holding, Lot, Portfolio, PortfolioSnapshotDB};
use crate::portfolio::holdings_service::{PORTFOLIO_ACCOUNT_ID, ROUNDING_SCALE, QUANTITY_THRESHOLD};
// Import transaction handlers if they remain in transaction.rs
use crate::portfolio::transaction::{get_transaction_handler};
use chrono::{NaiveDate, NaiveDateTime, Datelike};
use diesel::SqliteConnection;
use diesel::r2d2::{Pool, ConnectionManager};
use log::{error, info, warn};
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;
use crate::schema::portfolio_snapshots;
use diesel::prelude::*;


// Constants might be better defined in a config module or passed in
// const ROUNDING_SCALE: u32 = 6; // Defined in holdings_service, keep consistent
// const QUANTITY_THRESHOLD: &str = "0.0000001"; // Defined in holdings_service

pub struct PortfolioCalculator {
    asset_service: AssetService,
    base_currency: String,
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, // For saving snapshots
}

impl PortfolioCalculator {
    pub fn new(
        asset_service: AssetService,
        base_currency: String,
        pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    ) -> Self {
        PortfolioCalculator {
            asset_service,
            base_currency,
            pool,
        }
    }

    // Main function to calculate portfolio states and generate snapshots
    // Takes ownership or reference depending on usage pattern elsewhere
    pub async fn calculate_and_snapshot_portfolio_history(
        &self,
        mut activities: Vec<Activity>, // Sort in place
    ) -> Result<()> {
        info!("Starting portfolio calculation and snapshotting for {} activities...", activities.len());

        if activities.is_empty() {
            info!("No activities to process. Skipping snapshotting.");
            return Ok(());
        }

        // Fetch all assets once
        let assets = self.asset_service.get_assets()?;
        let assets_map: HashMap<_, _> = assets.iter().map(|a| (&a.id, a)).collect();

        // Sort activities by date and then ID for deterministic processing
        activities.sort_by_key(|a| (a.activity_date, a.id.clone()));

        // TODO: Optimization - Load the last known snapshot state before the first activity date?
        // Requires SnapshotService lookup and deserialization.
        // For now, starts fresh.
        let mut current_portfolio = Portfolio::new(
            self.base_currency.clone(),
             // Start time could be just before the first activity
             activities.first().map_or_else(chrono::Utc::now, |a| a.activity_date).naive_utc(),
        );

        let mut last_processed_date: Option<NaiveDate> = None;
        let mut last_activity_in_batch: Option<&Activity> = None;

        for activity in &activities {
            let current_activity_date = activity.activity_date.date();

            // Snapshot at the end of the previous day's batch if date changes
            if let Some(last_date) = last_processed_date {
                if current_activity_date > last_date {
                     if let Some(last_activity) = last_activity_in_batch {
                         // Update portfolio time to the last activity of the day before saving
                         current_portfolio.calculated_at = last_activity.activity_date.naive_utc();
                        self.save_portfolio_snapshot(&current_portfolio, last_date, Some(&last_activity.id))?;
                     }
                }
            }

            // Update portfolio timestamp before processing the activity
            // The final timestamp for a snapshot will be the timestamp of the *last* activity included.
            // current_portfolio.calculated_at = activity.activity_date.naive_utc(); // Set this after processing loop for the day

            match self.process_single_activity(&mut current_portfolio, activity, &assets_map) {
                Ok(_) => {
                    last_activity_in_batch = Some(activity); // Track last processed activity for snapshot info
                }
                Err(e) => {
                    error!(
                        "Error processing activity {} (Type: {}, Asset: {}, Date: {}): {}. Skipping activity.",
                        activity.id, activity.activity_type, activity.asset_id, activity.activity_date, e
                    );
                    // Continue processing next activity
                }
            }

            last_processed_date = Some(current_activity_date);
        }

        // Save the snapshot for the very last day/batch of activities
        if let (Some(last_date), Some(last_activity)) = (last_processed_date, last_activity_in_batch) {
             // Update timestamp to the very last activity processed
             current_portfolio.calculated_at = last_activity.activity_date.naive_utc();
            self.save_portfolio_snapshot(&current_portfolio, last_date, Some(&last_activity.id))?;
        }

        info!("Portfolio calculation and snapshotting completed.");
        Ok(())
    }

    // Processes a single activity, modifying the portfolio state
    fn process_single_activity(
        &self,
        portfolio: &mut Portfolio,
        activity: &Activity,
        assets_map: &HashMap<&String, &Asset>,
    ) -> Result<()> {
        // Determine ActivityType
        let activity_type = ActivityType::from_str(&activity.activity_type)
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e)))?;

        // Fetch asset if required by activity type
        let asset = match activity_type {
            ActivityType::Buy | ActivityType::Sell | ActivityType::Split |
            ActivityType::AddHolding | ActivityType::RemoveHolding | ActivityType::Dividend
            // TransferIn/Out might need it if not cash
            | ActivityType::TransferIn | ActivityType::TransferOut => {
                // Handle explicit cash asset_ids within Transfer transactions later
                if activity.asset_id.starts_with("$CASH") {
                    // For now, treat as non-asset op; Transaction handler decides based on type + asset_id
                    None
                } else {
                    Some(self.get_asset_by_id(assets_map, &activity.asset_id, &activity.id)?)
                }
            }
            // These types operate on cash or don't need a specific asset context here
            _ => None,
        };

        // Get transaction handler and process
        // Pass Option<&Asset> to handle cases where asset isn't needed/available
        let handler = get_transaction_handler(activity_type);
        handler.process(portfolio, activity, asset)?; // Transaction trait needs update for Option<&Asset>

        // Post-processing: Clean up holdings with insignificant quantities
        // Can be done here, or more efficiently within Sell/RemoveHolding transactions.
        // Let's assume transactions handle their own cleanup for now.

        Ok(())
    }

    // Helper to get asset by ID
    fn get_asset_by_id<'a>(
        &self,
        assets_map: &'a HashMap<&String, &Asset>,
        asset_id: &str,
        activity_id: &str, // For logging context
    ) -> Result<&'a Asset> {
        assets_map
            .get(&asset_id.to_string()) // Ensure lookup key matches map key type
            .copied()
            .ok_or_else(|| Error::Asset(format!("Asset ID '{}' not found for activity '{}'", asset_id, activity_id)))
    }


    // --- Snapshot Saving Logic ---

    fn save_portfolio_snapshot(
        &self,
        portfolio: &Portfolio,
        date: NaiveDate,
        triggering_activity_id: Option<&str>,
    ) -> Result<()> {
        let mut conn = self.pool.get()?; // Handle pool error

        let snapshot_date_str = date.format("%Y-%m-%d").to_string();

        // Saving a single snapshot representing the total portfolio state after 'date'
        let account_id = PORTFOLIO_ACCOUNT_ID.to_string();
        let snapshot_id = format!("{}-{}", account_id, snapshot_date_str);

        // Serialize the current state
        let portfolio_json = serde_json::to_string(portfolio)
            .map_err(|e| Error::Serialization(format!("Failed to serialize portfolio snapshot {}: {}", snapshot_id, e)))?;


        let new_snapshot = PortfolioSnapshotDB {
            id: snapshot_id.clone(),
            account_id,
            snapshot_date: snapshot_date_str,
            // Use the timestamp from the portfolio, which reflects the last processed activity time
            calculated_at: portfolio.calculated_at,
            portfolio_state_json: portfolio_json,
            triggering_activity_id: triggering_activity_id.map(String::from),
        };

        // Use insert or replace (upsert) semantics
        diesel::insert_into(portfolio_snapshots::table)
            .values(&new_snapshot)
            // Use primary key for conflict target
            .on_conflict(portfolio_snapshots::id)
            .do_update()
            // Specify fields to update on conflict
            .set((
                portfolio_snapshots::calculated_at.eq(new_snapshot.calculated_at),
                portfolio_snapshots::portfolio_state_json.eq(new_snapshot.portfolio_state_json),
                portfolio_snapshots::triggering_activity_id.eq(new_snapshot.triggering_activity_id),
                // Don't update account_id or snapshot_date on conflict
            ))
            .execute(&mut conn)
            .map_err(|e| Error::Database(format!("Failed to save portfolio snapshot {}: {}", snapshot_id, e)))?;

        info!("Saved/Updated portfolio snapshot: {}", snapshot_id);
        Ok(())
    }
}


// Public helper functions for Transaction implementations
// These need to be accessible, maybe move them to a portfolio::utils module?

// Adjusts cash balance in the portfolio state
pub fn calculator_adjust_cash(
    portfolio: &mut Portfolio,
    account_id: &str,
    currency: &str,
    amount: Decimal,
) {
     if currency.trim().is_empty() {
        warn!("Attempted cash adjustment for account '{}' with empty currency. Activity likely missing data.", account_id);
        return;
    }
    let rounded_amount = amount.round_dp(ROUNDING_SCALE);
    if rounded_amount.is_zero() && !amount.is_zero() {
        warn!("Cash adjustment for account '{}' currency '{}' rounded to zero from {}. Check ROUNDING_SCALE.", account_id, currency, amount);
    }

    let account_cash = portfolio
        .cash_positions
        .entry(account_id.to_string())
        .or_default();
    let balance = account_cash
        .entry(currency.to_string())
        .or_insert(Decimal::ZERO);
    *balance = (*balance + rounded_amount).round_dp(ROUNDING_SCALE); // Ensure result is also rounded

    // Optional: Clean up zero balances
     if balance.is_zero() {
         account_cash.remove(currency);
         if account_cash.is_empty() {
             portfolio.cash_positions.remove(account_id);
         }
     }
}

// Gets or creates a holding within the portfolio state
pub fn calculator_get_or_create_holding<'p>(
    portfolio: &'p mut Portfolio,
    account_id: &str,
    asset: &Asset, // Use Asset directly for info
    activity: &Activity, // For context like date if needed for new lot
) -> &'p mut Holding {
     let base_currency = portfolio.base_currency.clone();
     let calculation_time = portfolio.calculated_at; // Time of the portfolio state
     let asset_id = &asset.id; // Use the definitive asset ID

    let account_holdings = portfolio.holdings.entry(account_id.to_string()).or_default();

    account_holdings.entry(asset_id.to_string()).or_insert_with(|| {
        let holding_currency = asset.currency.clone();
        if holding_currency.trim().is_empty() {
             warn!(
                "Asset {} ('{}') used in activity {} has empty currency. Holding {} may be incorrect.",
                asset.id, asset.name.clone().unwrap_or_default(), activity.id, asset_id
             );
        }

         Holding {
            id: format!("{}-{}", account_id, asset_id),
            symbol: asset.symbol.clone().unwrap_or_else(|| {
                warn!("Asset {} missing symbol, using ID '{}' as fallback for holding.", asset.id, asset_id);
                asset_id.to_string()
            }),
            symbol_name: asset.name.clone(),
            holding_type: asset.asset_type.clone().unwrap_or_else(|| {
                warn!("Asset {} has no type, defaulting to UNKNOWN for holding {}", asset.id, asset_id);
                "UNKNOWN".to_string()
            }),
            currency: holding_currency.clone(),
            base_currency,
            lots: Vec::new(), // Start with empty lots
            account: Some(Account { // Simplified Account stub for context
                id: account_id.to_string(),
                name: format!("Account {}", account_id), // Placeholder
                account_type: "UNKNOWN".to_string(), // Placeholder
                group: None, // Placeholder
                currency: holding_currency, // Match holding currency
                is_default: false,
                is_active: true, // Assume active
                created_at: calculation_time, // Use portfolio calc time
                updated_at: calculation_time,
                platform_id: None, // Placeholder
            }),
            asset_class: asset.asset_class.clone(),
            asset_sub_class: asset.asset_sub_class.clone(),
            asset_data_source: Some(asset.data_source.clone()),
            sectors: asset.sectors.clone().and_then(|s| serde_json::from_str(&s).ok().or_else(|| {warn!("Failed to parse sectors JSON for asset {}", asset.id); None})),
            countries: asset.countries.clone().and_then(|c| serde_json::from_str(&c).ok().or_else(|| {warn!("Failed to parse countries JSON for asset {}", asset.id); None})),
        }
    })
}

// Note: ActivityType enum definition should ideally live in a shared place,
// like models.rs or activity.rs, and be imported here.
// Duplicating it here for self-containment if it wasn't imported.
// Remove this if it's properly imported from elsewhere.
/*
#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]
pub enum ActivityType {
    Buy, Sell, Dividend, Interest, Deposit, Withdrawal, TransferIn, TransferOut,
    ConversionIn, ConversionOut, Fee, Tax, Split, AddHolding, RemoveHolding,
}

impl FromStr for ActivityType {
    type Err = String;
    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "BUY" => Ok(ActivityType::Buy),
            "SELL" => Ok(ActivityType::Sell),
            "DIVIDEND" => Ok(ActivityType::Dividend),
            "INTEREST" => Ok(ActivityType::Interest),
            "DEPOSIT" => Ok(ActivityType::Deposit),
            "WITHDRAWAL" => Ok(ActivityType::Withdrawal),
            "TRANSFER_IN" | "TRANSFERIN" => Ok(ActivityType::TransferIn),
            "TRANSFER_OUT" | "TRANSFEROUT" => Ok(ActivityType::TransferOut),
            "CONVERSION_IN" | "CONVERSIONIN" => Ok(ActivityType::ConversionIn),
            "CONVERSION_OUT" | "CONVERSIONOUT" => Ok(ActivityType::ConversionOut),
            "FEE" => Ok(ActivityType::Fee),
            "TAX" => Ok(ActivityType::Tax),
            "SPLIT" => Ok(ActivityType::Split),
            "ADDHOLDING" | "ADD_HOLDING" => Ok(ActivityType::AddHolding),
            "REMOVEHOLDING" | "REMOVE_HOLDING" => Ok(ActivityType::RemoveHolding),
            _ => Err(format!("Invalid activity type: {}", s)),
        }
    }
}
*/ 