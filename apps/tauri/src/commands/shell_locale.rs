use std::sync::Arc;

use tauri::{AppHandle, Manager, State};

use crate::context::ServiceContext;
use crate::shell_i18n::ShellLocale;

#[tauri::command]
pub fn set_shell_locale(
    app: AppHandle,
    locale: String,
    ctx: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    let locale = crate::shell_i18n::normalize_shell_locale(&locale).to_string();
    log::info!("set_shell_locale requested: {}", locale);

    #[cfg(desktop)]
    {
        if let Some(shell) = app.try_state::<ShellLocale>() {
            if let Ok(mut g) = shell.0.write() {
                *g = locale.clone();
            }
        } else {
            log::warn!("set_shell_locale: ShellLocale state missing");
        }
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let app_data_dir = app_data_dir.to_string_lossy().to_string();
            crate::shell_i18n::persist_shell_locale(&app_data_dir, &locale);
        }

        let show_menu = ctx
            .settings_service()
            .get_settings()
            .map_err(|e| e.to_string())?
            .menu_bar_visible;

        if show_menu {
            match crate::menu::create_menu_for_locale(&app, &locale) {
                Ok(menu) => {
                    let _ = app.set_menu(menu);
                    log::info!("set_shell_locale applied menu locale: {}", locale);
                }
                Err(e) => log::warn!("Failed to rebuild menu after locale change: {}", e),
            }
        } else {
            log::debug!("set_shell_locale skipped menu rebuild (menu hidden)");
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, locale, ctx);
    }

    Ok(())
}
