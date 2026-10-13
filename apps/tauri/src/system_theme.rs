#[cfg(target_os = "linux")]
pub use linux::{install, read};

#[cfg(not(target_os = "linux"))]
pub fn install(_handle: &tauri::AppHandle) {}

#[cfg(not(target_os = "linux"))]
pub async fn read() -> Result<Option<tauri::Theme>, String> {
    Ok(None)
}

#[cfg(target_os = "linux")]
mod linux {
    use futures::StreamExt;
    use tauri::{Emitter, Theme};
    use zbus::zvariant::OwnedValue;

    const APPEARANCE: &str = "org.freedesktop.appearance";
    const COLOR_SCHEME: &str = "color-scheme";

    async fn portal() -> Result<zbus::Proxy<'static>, String> {
        let connection = zbus::Connection::session()
            .await
            .map_err(|error| format!("Could not connect to the desktop portal: {error}"))?;
        zbus::Proxy::new_owned(
            connection,
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Settings",
        )
        .await
        .map_err(|error| format!("Could not access desktop appearance settings: {error}"))
    }

    fn theme(value: &OwnedValue) -> Result<Theme, String> {
        // OwnedValue deserialization removes the outer variant; downcast_ref
        // also unwraps the extra inner variant returned by deprecated Read.
        let scheme = value
            .downcast_ref::<u32>()
            .map_err(|error| format!("Invalid system color scheme: {error}"))?;
        Ok(if scheme == 1 {
            Theme::Dark
        } else {
            Theme::Light
        })
    }

    pub async fn read() -> Result<Option<Theme>, String> {
        let value: OwnedValue = portal()
            .await?
            .call("Read", &(APPEARANCE, COLOR_SCHEME))
            .await
            .map_err(|error| format!("Could not read the system theme: {error}"))?;
        theme(&value).map(Some)
    }

    // Tauri's native ThemeChanged event is unsupported on Linux. Forward the
    // portal signal for the app's lifetime, independently of portfolio sessions.
    pub fn install(handle: &tauri::AppHandle) {
        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = listen(&handle).await {
                log::warn!("Could not listen for Linux system theme changes: {error}");
            }
        });
    }

    async fn listen(handle: &tauri::AppHandle) -> Result<(), String> {
        let proxy = portal().await?;
        let mut changes = proxy
            .receive_signal("SettingChanged")
            .await
            .map_err(|error| format!("Could not subscribe to appearance changes: {error}"))?;
        while let Some(change) = changes.next().await {
            let Ok((namespace, key, value)) =
                change.body().deserialize::<(String, String, OwnedValue)>()
            else {
                continue;
            };
            if namespace != APPEARANCE || key != COLOR_SCHEME {
                continue;
            }
            let resolved = match theme(&value) {
                Ok(theme) => theme,
                Err(error) => {
                    log::warn!("Ignoring invalid desktop appearance setting: {error}");
                    continue;
                }
            };
            if let Err(error) = handle.emit(crate::events::SYSTEM_THEME_CHANGED, resolved) {
                log::warn!("Could not notify system theme change: {error}");
            }
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use zbus::zvariant::Value;

        #[test]
        fn accepts_the_nested_read_variant_and_plain_signal_value() {
            let nested = OwnedValue::try_from(Value::new(Value::U32(1))).unwrap();
            assert_eq!(theme(&nested).unwrap(), Theme::Dark);
            assert_eq!(theme(&OwnedValue::from(1_u32)).unwrap(), Theme::Dark);
        }

        #[test]
        fn no_preference_and_unknown_values_resolve_to_light() {
            for scheme in [0_u32, 2, 99] {
                assert_eq!(theme(&OwnedValue::from(scheme)).unwrap(), Theme::Light);
            }
        }

        #[test]
        fn rejects_non_integer_settings() {
            let invalid = OwnedValue::try_from(Value::new("dark")).unwrap();
            assert!(theme(&invalid).is_err());
        }
    }
}
