use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub async fn check_for_update(app_handle: AppHandle, instance_id: &str, show_all_messages: bool) {
    match app_handle
        .updater_builder()
        .header("X-Instance-Id", instance_id)
        .expect("Failed to get updater")
        .build()
        .expect("Failed to build updater")
        .check()
        .await
    {
        Ok(update) => {
            if let Some(update) = update {
                let current_version = app_handle.package_info().version.to_string();
                if update.version.to_string() != current_version {
                    let update_message = format!(
                        "A new version of Wealthfolio is available!\n\n\
                        Current version: {}\n\
                        New version: {}\n\n\
                        {}\n\n\
                        Would you like to update now?",
                        current_version,
                        update.version,
                        update
                            .body
                            .clone()
                            .map(|body| format!("What's new in this version:\n{}", body))
                            .unwrap_or_default()
                    );
                    let do_update = app_handle
                        .dialog()
                        .message(&update_message)
                        .title("Wealthfolio Update Available")
                        .buttons(MessageDialogButtons::OkCancel)
                        .kind(MessageDialogKind::Info)
                        .blocking_show();

                    if do_update {
                        let _ = update.download_and_install(|_, _| {}, || {}).await;
                    }
                } else if show_all_messages {
                    app_handle
                        .dialog()
                        .message("You're already running the latest version of Wealthfolio.")
                        .title("No Updates Available")
                        .kind(MessageDialogKind::Info)
                        .show(|_| {});
                }
            } else if show_all_messages {
                app_handle
                    .dialog()
                    .message("You're already running the latest version of Wealthfolio.")
                    .title("No Updates Available")
                    .kind(MessageDialogKind::Info)
                    .show(|_| {});
            }
        }
        Err(e) if show_all_messages => {
            app_handle
                .dialog()
                .message(format!("We encountered an issue while checking for updates:\n\n{}\n\nPlease try again later or contact support if the problem persists.", e))
                .title("Update Check Failed")
                .kind(MessageDialogKind::Error)
                .show(|_| {});
        }
        _ => {}
    }
    // Ok(())
}
