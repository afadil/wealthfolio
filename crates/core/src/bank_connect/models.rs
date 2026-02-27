use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BankKey {
    Ing,
    Cba,
    Anz,
    Bom,
    Beyond,
}

impl BankKey {
    pub fn as_str(&self) -> &'static str {
        match self {
            BankKey::Ing => "ING",
            BankKey::Cba => "CBA",
            BankKey::Anz => "ANZ",
            BankKey::Bom => "BOM",
            BankKey::Beyond => "BEYOND",
        }
    }

    pub fn login_url(&self) -> &'static str {
        match self {
            BankKey::Ing => "https://www.ing.com.au/securebanking/",
            BankKey::Cba => "https://www.netbank.com.au/netbank/banksession/login",
            BankKey::Anz => "https://www.anz.com.au/IBAU/BANKAWAYTRAN",
            BankKey::Bom => "https://ibanking.bankofmelbourne.com.au/ibank/loginPage.action",
            BankKey::Beyond => "https://ibank.beyondbank.com.au/fb/",
        }
    }

    pub fn post_login_pattern(&self) -> &'static str {
        match self {
            BankKey::Ing => "/securebanking/index.html",
            BankKey::Cba => "/netbank/dashboard",
            BankKey::Anz => "/IBAU/BANKAWAY",
            BankKey::Bom => "/ibank/portalPage.action",
            BankKey::Beyond => "/fb/ib/prf/",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            BankKey::Ing => "ING",
            BankKey::Cba => "CommBank",
            BankKey::Anz => "ANZ",
            BankKey::Bom => "Bank of Melbourne",
            BankKey::Beyond => "Beyond Bank",
        }
    }
}

impl std::fmt::Display for BankKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for BankKey {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "ING" => Ok(BankKey::Ing),
            "CBA" => Ok(BankKey::Cba),
            "ANZ" => Ok(BankKey::Anz),
            "BOM" => Ok(BankKey::Bom),
            "BEYOND" => Ok(BankKey::Beyond),
            _ => Err(format!("Unknown bank key: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BankDownloadRun {
    pub id: String,
    pub bank_key: String,
    pub account_name: Option<String>,
    pub status: String,
    pub files_downloaded: i32,
    pub files_skipped: i32,
    pub error_message: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBankDownloadRun {
    pub id: String,
    pub bank_key: String,
    pub account_name: Option<String>,
    pub status: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BankConnectSettings {
    pub download_folder: String,
    pub years_back: u32,
    pub enabled_banks: Vec<String>,
    pub overwrite_existing: bool,
}

impl Default for BankConnectSettings {
    fn default() -> Self {
        Self {
            download_folder: "~/BankStatements".to_string(),
            years_back: 7,
            enabled_banks: vec![
                "ING".to_string(),
                "CBA".to_string(),
                "ANZ".to_string(),
                "BOM".to_string(),
                "BEYOND".to_string(),
            ],
            overwrite_existing: false,
        }
    }
}
