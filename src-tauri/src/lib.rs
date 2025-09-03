// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod addons;
mod context;
mod events;
mod listeners;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod menu;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod updater;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use log::{error};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use updater::check_for_update;

use dotenvy::dotenv;
use std::env;
use std::sync::Arc;
use uuid;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::async_runtime::spawn;

use tauri::AppHandle;
use tauri::Manager;

use context::ServiceContext;
use events::{emit_portfolio_trigger_update, PortfolioRequestPayload};
use wealthfolio_core::sync::engine::SyncEngine;

#[derive(Clone)]
pub struct SyncHandles {
    pub engine: SyncEngine,
}

fn get_or_create_device_id() -> Result<String, Box<dyn std::error::Error>> {
    use keyring::Entry;
    let entry = Entry::new("wealthfolio", "device_id")?;
    if let Ok(existing) = entry.get_password() {
        return Ok(existing);
    }
    let id = uuid::Uuid::new_v4().to_string();
    entry.set_password(&id)?;
    Ok(id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv().ok(); // Load environment variables from .env file if available

    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            // Only initialize desktop-only plugins on non-mobile platforms
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build());
                let _ = app.handle().plugin(tauri_plugin_window_state::Builder::new().build());
            }

            // Initialize mobile-only plugins
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                let _ = app.handle().plugin(tauri_plugin_barcode_scanner::init());
            }

            let handle = app.handle().clone();

            // Block synchronously on the essential async setup
            tauri::async_runtime::block_on(async {
                let app_data_dir = handle
                    .path()
                    .app_data_dir()? // Use ? directly on the Result
                    .to_str()
                    .ok_or("Failed to convert app data dir path to string")?
                    .to_string();

                // Initialize context asynchronously
                let context = match context::initialize_context(&app_data_dir).await {
                    Ok(ctx) => Arc::new(ctx),
                    Err(e) => {
                        #[cfg(not(any(target_os = "android", target_os = "ios")))]
                        error!("Failed to initialize context: {}", e);
                        // Propagate the original boxed error
                        return Err(e);
                    }
                };

                // Make context available to all commands *before* setup returns
                handle.manage(context.clone());

                // Get instance_id after context is managed
                let instance_id = context.instance_id.clone();

                // --- Setup event listeners ---
                listeners::setup_event_listeners(handle.clone());

                // --- Spawn non-critical async tasks ---
                spawn_background_tasks(handle.clone(), context.clone(), instance_id);

                Ok(())
            })
            // Handle potential errors from the block_on section
            .map_err(|e: Box<dyn std::error::Error>| {
                #[cfg(not(any(target_os = "android", target_os = "ios")))]
                error!("Critical setup failed: {}", e);
                // Convert the boxed error into Tauri's setup error type if needed, or handle otherwise
                tauri::Error::Setup(e.into()) // Or Box::new(tauri::Error::Setup(e.into())) depending on signature needs
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::account::get_accounts,
            commands::account::get_active_accounts,
            commands::account::create_account,
            commands::account::update_account,
            commands::account::delete_account,
            commands::activity::search_activities,
            commands::activity::get_activities,
            commands::activity::create_activity,
            commands::activity::update_activity,
            commands::activity::delete_activity,
            commands::activity::check_activities_import,
            commands::activity::import_activities,
            commands::activity::get_account_import_mapping,
            commands::activity::save_account_import_mapping,
            commands::settings::get_settings,
            commands::settings::is_auto_update_check_enabled,
            commands::settings::update_settings,
            commands::settings::get_latest_exchange_rates,
            commands::settings::update_exchange_rate,
            commands::settings::add_exchange_rate,
            commands::settings::delete_exchange_rate,
            commands::goal::create_goal,
            commands::goal::update_goal,
            commands::goal::delete_goal,
            commands::goal::get_goals,
            commands::goal::update_goal_allocations,
            commands::goal::load_goals_allocations,
            commands::portfolio::get_holdings,
            commands::portfolio::get_holding,
            commands::portfolio::get_income_summary,
            commands::portfolio::get_historical_valuations,
            commands::portfolio::get_latest_valuations,
            commands::portfolio::calculate_accounts_simple_performance,
            commands::portfolio::update_portfolio,
            commands::portfolio::recalculate_portfolio,
            commands::portfolio::calculate_performance_summary,
            commands::portfolio::calculate_performance_history,
            commands::limits::get_contribution_limits,
            commands::limits::create_contribution_limit,
            commands::limits::update_contribution_limit,
            commands::limits::delete_contribution_limit,
            commands::limits::calculate_deposits_for_contribution_limit,
            commands::utilities::backup_database,
            commands::utilities::backup_database_to_path,
            commands::utilities::restore_database,
            commands::asset::get_asset_profile,
            commands::asset::update_asset_profile,
            commands::asset::update_asset_data_source,
            commands::market_data::search_symbol,
            commands::market_data::sync_market_data,
            commands::market_data::update_quote,
            commands::market_data::delete_quote,
            commands::market_data::get_quote_history,
            commands::market_data::get_market_data_providers,
            commands::secrets::set_secret,
            commands::secrets::get_secret,
            commands::secrets::delete_secret,
            commands::providers_settings::get_market_data_providers_settings,
            commands::providers_settings::update_market_data_provider_settings,
            commands::addon::extract_addon_zip,
            commands::addon::install_addon_zip,
            commands::addon::list_installed_addons,
            commands::addon::toggle_addon,
            commands::addon::uninstall_addon,
            commands::addon::load_addon_for_runtime,
            commands::addon::get_enabled_addons_on_startup,
            commands::addon::check_addon_update,
            commands::addon::check_all_addon_updates,
            commands::addon::update_addon_from_store_by_id,
            commands::addon::fetch_addon_store_listings,
            commands::addon::download_addon_to_staging,
            commands::addon::install_addon_from_staging,
            commands::addon::clear_addon_staging,
            commands::addon::submit_addon_rating,
            // Sync (QR pairing)
            commands::sync::get_sync_status,
            commands::sync::get_device_name,
            commands::sync::generate_pairing_payload,
            commands::sync::sync_with_master,
            commands::sync::force_full_sync_with_master,
            commands::sync::sync_now,
            commands::sync::initialize_sync_for_existing_data,
            commands::sync::set_as_master,
            commands::sync::remove_master_device,
        ])
        .build(tauri::generate_context!())
        .expect("error while running wealthfolio application");

    app.run(|_app_handle, _event| {});
}

/// Spawns background tasks such as menu setup, update checks, and initial portfolio sync.
fn spawn_background_tasks(
    handle: AppHandle,
    _context: Arc<ServiceContext>,
    _instance_id: Arc<String>,
) {
    // Set up menu (can happen after state is managed) - Desktop only
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let menu_handle = handle.clone();
        let instance_id_menu = _instance_id.clone();
        tauri::async_runtime::spawn(async move {
            match menu::create_menu(&menu_handle) {
                Ok(menu) => {
                    if let Err(e) = menu_handle.set_menu(menu) {
                        error!("Failed to set menu: {}", e);
                    }
                }
                Err(e) => {
                    error!("Failed to create menu: {}", e);
                }
            }
            // Set up the menu event handler
            menu_handle.on_menu_event(move |app, event| {
                menu::handle_menu_event(app, &*instance_id_menu, event.id().as_ref());
            });
        });

        // Check for updates on startup (if enabled) - Desktop only
        let update_handle = handle.clone();
        let instance_id_update = _instance_id.clone();
        let update_context = _context.clone();
        spawn(async move { 
            // Check if auto-update is enabled before performing the check
            if let Ok(is_enabled) = update_context.settings_service().is_auto_update_check_enabled() {
                if is_enabled {
                    check_for_update(update_handle, &*instance_id_update, false).await;
                }
            }
        });
    }

    // Trigger initial portfolio update on startup
    // Defaults: no specific accounts (all), sync market data (all symbols), incremental calculation
    let initial_payload = PortfolioRequestPayload::builder()
        .account_ids(None)
        .refetch_all_market_data(false)
        .build();
    emit_portfolio_trigger_update(&handle, initial_payload);

    // P2P sync (desktop and mobile)
    let handle_clone = handle.clone();
    let ctx_for_sync = _context.clone();
    tauri::async_runtime::spawn(async move {
        // 1) Get DB pool
        let pool = ctx_for_sync.db_pool(); // new accessor

        // 2) Stable device_id (keychain)
        let device_id_str = get_or_create_device_id().unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
        let device_id = uuid::Uuid::parse_str(&device_id_str).unwrap_or_else(|_| uuid::Uuid::new_v4());

        // Mirror device_id into DB for triggers
        {
            use diesel::prelude::*;
            let mut conn = pool.get().expect("db conn");
            let _ = diesel::sql_query("PRAGMA foreign_keys = ON;").execute(&mut conn);
            let _ = diesel::sql_query("INSERT OR REPLACE INTO sync_device(id) VALUES (?1)")
                .bind::<diesel::sql_types::Text, _>(&device_id_str)
                .execute(&mut conn);
        }

        // 3) Create and start the engine
        let engine = SyncEngine::with_device_id(pool.clone(), device_id)
            .expect("sync engine");
        if let Err(_e) = engine.start().await {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            log::error!("sync start error: {_e}");
            return;
        }

    // Keep engine reachable from commands
        handle_clone.manage(SyncHandles { engine });
    });
}