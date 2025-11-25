// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod context;
mod events;
mod listeners;
mod secret_store;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod menu;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod updater;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use log::error;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use updater::check_for_update;

use dotenvy::dotenv;
use std::env;
use std::sync::Arc;

use tauri::AppHandle;
use tauri::Manager;

use context::ServiceContext;
use events::{emit_app_ready, emit_portfolio_trigger_update, PortfolioRequestPayload};

/// Spawns background tasks such as menu setup, update checks, and initial portfolio update.
fn spawn_background_tasks(
    handle: AppHandle,
    context: Arc<ServiceContext>,
    instance_id: Arc<String>,
) {
    // Set up menu and updater (desktop only)
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let menu_handle = handle.clone();
        let instance_id_menu = instance_id.clone();
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

        // Check for updates on startup (if enabled)
        let update_handle = handle.clone();
        let instance_id_update = instance_id.clone();
        let update_context = context.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(is_enabled) = update_context
                .settings_service()
                .is_auto_update_check_enabled()
            {
                if is_enabled {
                    check_for_update(update_handle, &*instance_id_update, false).await;
                }
            }
        });
    }

    // Trigger initial portfolio update on startup
    let initial_payload = PortfolioRequestPayload::builder()
        .account_ids(None)
        .refetch_all_market_data(false)
        .build();
    emit_portfolio_trigger_update(&handle, initial_payload);
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
                let _ = app
                    .handle()
                    .plugin(tauri_plugin_updater::Builder::new().build());
                let _ = app
                    .handle()
                    .plugin(tauri_plugin_window_state::Builder::new().build());
            }

            // Initialize mobile-only plugins
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                let handle = app.handle();
                let _ = handle.plugin(tauri_plugin_haptics::init());
            }

            let handle = app.handle().clone();

            // Derive the app data directory path once (sync) and reuse in both branches.
            let app_data_dir = handle
                .path()
                .app_data_dir()? // tauri::Result<PathBuf>
                .to_string_lossy()
                .to_string();

            // --- Setup event listeners early (does not require context to register) ---
            listeners::setup_event_listeners(handle.clone());

            // Desktop platforms: perform essential async setup synchronously
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                tauri::async_runtime::block_on(async {
                    // Initialize context asynchronously
                    let context = match context::initialize_context(&app_data_dir).await {
                        Ok(ctx) => Arc::new(ctx),
                        Err(e) => {
                            error!("Failed to initialize context: {}", e);
                            // Propagate the original boxed error
                            return Err(e);
                        }
                    };

                    // Make context available to all commands before setup returns
                    handle.manage(context.clone());

                    // Spawn background non-critical tasks
                    let instance_id = context.instance_id.clone();
                    spawn_background_tasks(handle.clone(), context.clone(), instance_id);

                    // Optionally notify frontend that the app is ready
                    emit_app_ready(&handle);

                    Ok(())
                })
                .map_err(|e: Box<dyn std::error::Error>| {
                    error!("Critical setup failed: {}", e);
                    // Forward the original error
                    e
                })?;
            }

            // Mobile platforms (iOS/Android): do NOT block the main thread; spawn setup
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                let handle_clone = handle.clone();
                let app_data_dir_clone = app_data_dir.clone();
                tauri::async_runtime::spawn(async move {
                    match context::initialize_context(&app_data_dir_clone).await {
                        Ok(ctx) => {
                            let ctx = Arc::new(ctx);
                            handle_clone.manage(ctx.clone());
                            // Spawn background non-critical tasks
                            let instance_id = ctx.instance_id.clone();
                            spawn_background_tasks(handle_clone.clone(), ctx.clone(), instance_id);
                            // Signal readiness to the frontend
                            emit_app_ready(&handle_clone);
                        }
                        Err(e) => {
                            // Use fully-qualified log macro to avoid import issues on mobile
                            log::error!("Failed to initialize context on mobile: {}", e);
                            // Still emit a ready event so UI can show an error state if desired
                            emit_app_ready(&handle_clone);
                        }
                    }
                });
            }

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
            commands::activity::save_activities,
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
            commands::utilities::get_app_info,
            commands::utilities::backup_database,
            commands::utilities::backup_database_to_path,
            commands::utilities::restore_database,
            commands::asset::get_asset_profile,
            commands::asset::get_assets,
            commands::asset::update_asset_profile,
            commands::asset::update_asset_data_source,
            commands::asset::delete_asset,
            commands::market_data::search_symbol,
            commands::market_data::sync_market_data,
            commands::market_data::update_quote,
            commands::market_data::delete_quote,
            commands::market_data::get_quote_history,
            commands::market_data::get_latest_quotes,
            commands::market_data::get_market_data_providers,
            commands::market_data::import_quotes_csv,
            commands::platform::get_platform,
            commands::platform::is_mobile,
            commands::platform::is_desktop,
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
        ])
        .build(tauri::generate_context!())
        .expect("error while running wealthfolio application");

    app.run(|_app_handle, _event| {});
}
