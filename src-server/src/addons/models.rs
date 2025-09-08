use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AddonFile {
    pub name: String,
    pub content: String,
    pub is_main: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FunctionPermission {
    pub name: String,
    pub is_declared: bool,
    pub is_detected: bool,
    pub detected_at: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddonPermission {
    pub category: String,
    pub functions: Vec<FunctionPermission>,
    pub purpose: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddonManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    #[serde(rename = "sdkVersion")]
    pub sdk_version: Option<String>,
    pub main: Option<String>,
    pub enabled: Option<bool>,
    pub permissions: Option<Vec<AddonPermission>>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub license: Option<String>,
    #[serde(rename = "minWealthfolioVersion")]
    pub min_wealthfolio_version: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub icon: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

impl AddonManifest {
    pub fn to_installed(mut self, enable_after_install: bool) -> Result<Self, String> {
        if self.main.is_none() {
            return Err("Missing 'main' field in manifest.json".to_string());
        }
        self.enabled = Some(enable_after_install);
        self.installed_at = Some(chrono::Utc::now().to_rfc3339());
        self.source = Some("local".to_string());
        Ok(self)
    }

    pub fn get_main(&self) -> Result<&str, String> {
        self.main.as_deref().ok_or("Main file not specified".to_string())
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.unwrap_or(true)
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedAddon {
    pub metadata: AddonManifest,
    pub files: Vec<AddonFile>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAddon {
    pub metadata: AddonManifest,
    pub file_path: String,
    pub is_zip_addon: bool,
}

