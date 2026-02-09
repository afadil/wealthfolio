// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod context;
mod domain_events;
mod events;
mod listeners;
mod scheduler;
mod secret_store;
mod services;

#[cfg(desktop)]
mod menu;
#[cfg(desktop)]
mod updater;

use std::sync::Arc;

use dotenvy::dotenv;
use log::error;
use tauri::{AppHandle, Emitter, Manager};

use events::emit_app_ready;
use tauri_plugin_deep_link::DeepLinkExt;

// ─────────────────────────────────────────────────────────────────────────────
// Desktop-only setup
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(desktop)]
mod desktop {
    use super::*;

    /// Sets up the application menu and its event handler.
    pub fn setup_menu(handle: &AppHandle, instance_id: &Arc<String>) {
        match menu::create_menu(handle) {
            Ok(menu) => {
                if let Err(e) = handle.set_menu(menu) {
                    error!("Failed to set menu: {}", e);
                }
            }
            Err(e) => {
                error!("Failed to create menu: {}", e);
            }
        }

        let instance_id = Arc::clone(instance_id);
        handle.on_menu_event(move |app, event| {
            menu::handle_menu_event(app, &instance_id, event.id().as_ref());
        });
    }

    /// Initializes desktop-specific plugins.
    pub fn init_plugins(handle: &AppHandle) {
        let _ = handle.plugin(tauri_plugin_updater::Builder::new().build());
        let _ = handle.plugin(tauri_plugin_window_state::Builder::new().build());
    }

    /// Performs synchronous setup on desktop: initializes context, menu, and registers listeners.
    pub fn setup(handle: AppHandle, app_data_dir: &str) -> Result<(), Box<dyn std::error::Error>> {
        // Initialize context synchronously (required before any commands can work)
        let init_result = tauri::async_runtime::block_on(async {
            context::initialize_context(app_data_dir).await
        })?;
        let context = Arc::new(init_result.context);
        let event_receiver = init_result.event_receiver;

        // Make context available to all commands
        handle.manage(Arc::clone(&context));

        // Start the domain event queue worker now that context is managed
        // This must be done in an async context since it spawns a tokio task
        let worker_handle = handle.clone();
        let worker_context = Arc::clone(&context);
        tauri::async_runtime::spawn(async move {
            domain_events::TauriDomainEventSink::start_queue_worker(
                event_receiver,
                worker_handle,
                worker_context,
            );
        });

        // Menu setup is synchronous (no I/O)
        setup_menu(&handle, &context.instance_id);

        // Notify frontend that app is ready
        // The frontend will trigger the initial portfolio update and update check after it's mounted
        emit_app_ready(&handle);

        // Trigger startup sync (async, non-blocking)
        // After this, user manually triggers sync via button
        let startup_handle = handle.clone();
        let startup_context = Arc::clone(&context);
        tauri::async_runtime::spawn(async move {
            scheduler::run_startup_sync(&startup_handle, &startup_context).await;
        });

        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile-only setup
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(mobile)]
mod mobile {
    use super::*;

    /// Initializes mobile-specific plugins.
    pub fn init_plugins(handle: &AppHandle) {
        let _ = handle.plugin(tauri_plugin_haptics::init());
        let _ = handle.plugin(tauri_plugin_barcode_scanner::init());

        // iOS-specific: Web Auth plugin for ASWebAuthenticationSession (required for Google OAuth)
        #[cfg(target_os = "ios")]
        {
            let _ = handle.plugin(tauri_plugin_web_auth::init());
        }
    }

    /// Performs async setup on mobile without blocking the main thread.
    pub fn setup(handle: AppHandle, app_data_dir: String) {
        tauri::async_runtime::spawn(async move {
            match context::initialize_context(&app_data_dir).await {
                Ok(init_result) => {
                    let context = Arc::new(init_result.context);
                    let event_receiver = init_result.event_receiver;

                    handle.manage(Arc::clone(&context));

                    // Start the domain event queue worker now that context is managed
                    domain_events::TauriDomainEventSink::start_queue_worker(
                        event_receiver,
                        handle.clone(),
                        Arc::clone(&context),
                    );

                    // Notify frontend that app is ready
                    // The frontend will trigger the initial portfolio update after it's mounted
                    // For mobile, foreground sync is triggered from frontend via app lifecycle events
                    emit_app_ready(&handle);
                }
                Err(e) => {
                    error!("Failed to initialize context on mobile: {}", e);
                    // Emit ready so UI can show error state
                    emit_app_ready(&handle);
                }
            }
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Returns the app data directory path.
fn get_app_data_dir(handle: &AppHandle) -> Result<String, Box<dyn std::error::Error>> {
    Ok(handle.path().app_data_dir()?.to_string_lossy().into_owned())
}

// ─────────────────────────────────────────────────────────────────────────────
// Application entry point
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv().ok();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                // Suppress verbose debug logs from the updater plugin
                .filter(|metadata| {
                    !metadata.target().starts_with("tauri_plugin_updater")
                        || metadata.level() <= log::Level::Info
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Platform-specific plugin initialization
            #[cfg(desktop)]
            desktop::init_plugins(&handle);

            #[cfg(mobile)]
            mobile::init_plugins(&handle);

            // Get app data directory
            let app_data_dir = get_app_data_dir(&handle)?;

            // Setup event listeners (platform-agnostic)
            listeners::setup_event_listeners(handle.clone());

            // Setup deep link handler
            let deep_link_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                log::info!("Deep link received: {:?}", urls);
                for url in urls {
                    let _ = deep_link_handle.emit("deep-link-received", url.to_string());
                }
            });

            // Platform-specific setup
            #[cfg(desktop)]
            desktop::setup(handle, &app_data_dir).map_err(|e| {
                error!("Desktop setup failed: {}", e);
                e
            })?;

            #[cfg(mobile)]
            mobile::setup(handle, app_data_dir);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Account commands
            commands::account::get_accounts,
            commands::account::create_account,
            commands::account::update_account,
            commands::account::delete_account,
            // Activity commands
            commands::activity::search_activities,
            commands::activity::create_activity,
            commands::activity::update_activity,
            commands::activity::save_activities,
            commands::activity::delete_activity,
            commands::activity::check_activities_import,
            commands::activity::import_activities,
            commands::activity::get_account_import_mapping,
            commands::activity::save_account_import_mapping,
            commands::activity::check_existing_duplicates,
            commands::activity::parse_csv,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::is_auto_update_check_enabled,
            commands::settings::update_settings,
            commands::settings::get_latest_exchange_rates,
            commands::settings::update_exchange_rate,
            commands::settings::add_exchange_rate,
            commands::settings::delete_exchange_rate,
            // Goal commands
            commands::goal::create_goal,
            commands::goal::update_goal,
            commands::goal::delete_goal,
            commands::goal::get_goals,
            commands::goal::update_goal_allocations,
            commands::goal::load_goals_allocations,
            // Portfolio commands
            commands::portfolio::get_holdings,
            commands::portfolio::get_holding,
            commands::portfolio::get_portfolio_allocations,
            commands::portfolio::get_holdings_by_allocation,
            commands::portfolio::get_income_summary,
            commands::portfolio::get_historical_valuations,
            commands::portfolio::get_latest_valuations,
            commands::portfolio::calculate_accounts_simple_performance,
            commands::portfolio::update_portfolio,
            commands::portfolio::recalculate_portfolio,
            commands::portfolio::calculate_performance_summary,
            commands::portfolio::calculate_performance_history,
            commands::portfolio::save_manual_holdings,
            commands::portfolio::import_holdings_csv,
            commands::portfolio::get_snapshots,
            commands::portfolio::get_snapshot_by_date,
            commands::portfolio::delete_snapshot,
            // Contribution limit commands
            commands::limits::get_contribution_limits,
            commands::limits::create_contribution_limit,
            commands::limits::update_contribution_limit,
            commands::limits::delete_contribution_limit,
            commands::limits::calculate_deposits_for_contribution_limit,
            // Utility commands
            commands::utilities::get_app_info,
            commands::utilities::check_for_updates,
            commands::utilities::install_app_update,
            commands::utilities::backup_database,
            commands::utilities::backup_database_to_path,
            commands::utilities::restore_database,
            // Asset commands
            commands::asset::get_asset_profile,
            commands::asset::get_assets,
            commands::asset::update_asset_profile,
            commands::asset::update_quote_mode,
            commands::asset::delete_asset,
            // Alternative asset commands
            commands::alternative_assets::create_alternative_asset,
            commands::alternative_assets::update_alternative_asset_valuation,
            commands::alternative_assets::update_alternative_asset_metadata,
            commands::alternative_assets::delete_alternative_asset,
            commands::alternative_assets::link_liability,
            commands::alternative_assets::unlink_liability,
            commands::alternative_assets::get_net_worth,
            commands::alternative_assets::get_net_worth_history,
            commands::alternative_assets::get_alternative_holdings,
            // Market data commands
            commands::market_data::search_symbol,
            commands::market_data::sync_market_data,
            commands::market_data::update_quote,
            commands::market_data::delete_quote,
            commands::market_data::get_quote_history,
            commands::market_data::get_latest_quotes,
            commands::market_data::get_market_data_providers,
            commands::market_data::check_quotes_import,
            commands::market_data::import_quotes_csv,
            commands::market_data::get_exchanges,
            // Taxonomy commands
            commands::taxonomy::get_taxonomies,
            commands::taxonomy::get_taxonomy,
            commands::taxonomy::create_taxonomy,
            commands::taxonomy::update_taxonomy,
            commands::taxonomy::delete_taxonomy,
            commands::taxonomy::create_category,
            commands::taxonomy::update_category,
            commands::taxonomy::delete_category,
            commands::taxonomy::move_category,
            commands::taxonomy::import_taxonomy_json,
            commands::taxonomy::export_taxonomy_json,
            commands::taxonomy::get_asset_taxonomy_assignments,
            commands::taxonomy::assign_asset_to_category,
            commands::taxonomy::remove_asset_taxonomy_assignment,
            // Taxonomy migration commands
            commands::taxonomy::get_migration_status,
            commands::taxonomy::migrate_legacy_classifications,
            // Platform commands
            commands::platform::get_platform,
            commands::platform::is_mobile,
            commands::platform::is_desktop,
            // Secrets commands
            commands::secrets::set_secret,
            commands::secrets::get_secret,
            commands::secrets::delete_secret,
            // Provider settings commands
            commands::providers_settings::get_market_data_providers_settings,
            commands::providers_settings::update_market_data_provider_settings,
            // AI provider commands
            commands::ai_providers::get_ai_providers,
            commands::ai_providers::update_ai_provider_settings,
            commands::ai_providers::set_default_ai_provider,
            commands::ai_providers::list_ai_models,
            // AI chat commands
            commands::ai_chat::stream_ai_chat,
            commands::ai_chat::list_ai_threads,
            commands::ai_chat::get_ai_thread,
            commands::ai_chat::get_ai_thread_messages,
            commands::ai_chat::update_ai_thread,
            commands::ai_chat::delete_ai_thread,
            commands::ai_chat::add_ai_thread_tag,
            commands::ai_chat::remove_ai_thread_tag,
            commands::ai_chat::get_ai_thread_tags,
            commands::ai_chat::update_tool_result,
            // Addon commands
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
            // Sync commands
            commands::wealthfolio_connect::store_sync_session,
            commands::wealthfolio_connect::clear_sync_session,
            commands::brokers_sync::sync_broker_data,
            commands::brokers_sync::get_synced_accounts,
            commands::brokers_sync::get_platforms,
            commands::brokers_sync::list_broker_connections,
            commands::brokers_sync::list_broker_accounts,
            commands::brokers_sync::get_subscription_plans,
            commands::brokers_sync::get_subscription_plans_public,
            commands::brokers_sync::get_user_info,
            commands::brokers_sync::get_broker_sync_states,
            commands::brokers_sync::get_import_runs,
            // Device sync commands
            commands::device_sync::enroll_device,
            commands::device_sync::get_device,
            commands::device_sync::list_devices,
            commands::device_sync::update_device,
            commands::device_sync::delete_device,
            commands::device_sync::revoke_device,
            // Team keys (E2EE)
            commands::device_sync::initialize_team_keys,
            commands::device_sync::commit_initialize_team_keys,
            commands::device_sync::rotate_team_keys,
            commands::device_sync::commit_rotate_team_keys,
            commands::device_sync::reset_team_sync,
            // Pairing (Issuer - Trusted Device)
            commands::device_sync::create_pairing,
            commands::device_sync::get_pairing,
            commands::device_sync::approve_pairing,
            commands::device_sync::complete_pairing,
            commands::device_sync::cancel_pairing,
            // Pairing (Claimer - New Device)
            commands::device_sync::claim_pairing,
            commands::device_sync::get_pairing_messages,
            commands::device_sync::confirm_pairing,
            // Device enroll service (high-level commands)
            commands::device_enroll_service::get_device_sync_state,
            commands::device_enroll_service::enable_device_sync,
            commands::device_enroll_service::clear_device_sync_data,
            commands::device_enroll_service::reinitialize_device_sync,
            // Sync crypto commands
            commands::sync_crypto::sync_generate_root_key,
            commands::sync_crypto::sync_derive_dek,
            commands::sync_crypto::sync_generate_keypair,
            commands::sync_crypto::sync_compute_shared_secret,
            commands::sync_crypto::sync_derive_session_key,
            commands::sync_crypto::sync_encrypt,
            commands::sync_crypto::sync_decrypt,
            commands::sync_crypto::sync_generate_pairing_code,
            commands::sync_crypto::sync_hash_pairing_code,
            commands::sync_crypto::sync_compute_sas,
            commands::sync_crypto::sync_generate_device_id,
            // Health commands
            commands::health::get_health_status,
            commands::health::run_health_checks,
            commands::health::dismiss_health_issue,
            commands::health::restore_health_issue,
            commands::health::get_dismissed_health_issues,
            commands::health::execute_health_fix,
            commands::health::get_health_config,
            commands::health::update_health_config,
        ])
        .build(tauri::generate_context!())
        .expect("Failed to build Wealthfolio application")
        .run(|_handle, _event| {});
}
