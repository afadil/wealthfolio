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
    if locale != "en" && locale != "de" {
        return Err(format!("Unsupported locale: {}", locale));
    }

    #[cfg(desktop)]
    {
        if let Some(shell) = app.try_state::<ShellLocale>() {
            if let Ok(mut g) = shell.0.write() {
                *g = locale.clone();
            }
        }

        let show_menu = ctx
            .settings_service()
            .get_settings()
            .map_err(|e| e.to_string())?
            .menu_bar_visible;

        if show_menu {
            match crate::menu::create_menu(&app) {
                Ok(menu) => {
                    let _ = app.set_menu(menu);
                }
                Err(e) => log::warn!("Failed to rebuild menu after locale change: {}", e),
            }
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, locale, ctx);
    }

    Ok(())
}
