use rust_decimal::Decimal;
use diesel::prelude::*;
use diesel::Queryable;
    use serde::{Deserialize, Serialize};
// Import holding models from the new location
// use crate::holdings::holdings_model::{Holding, Lot};
// Import decimal serializers from the new utils module
use crate::utils::decimal_serde::*;


#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Performance {
    #[serde(with = "decimal_serde")]
    pub total_gain_percent: Decimal,
    #[serde(with = "decimal_serde")]
    pub total_gain_amount: Decimal,
    #[serde(with = "decimal_serde")]
    pub total_gain_amount_converted: Decimal,
    #[serde(with = "decimal_serde_option")]
    pub day_gain_percent: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub day_gain_amount: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub day_gain_amount_converted: Option<Decimal>,
}



impl Default for Performance {
    fn default() -> Self {
        Performance {
            total_gain_percent: Decimal::ZERO,
            total_gain_amount: Decimal::ZERO,
            total_gain_amount_converted: Decimal::ZERO,
            day_gain_percent: Some(Decimal::ZERO),
            day_gain_amount: Some(Decimal::ZERO),
            day_gain_amount_converted: Some(Decimal::ZERO),
        }
    }
}


#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub font: String,
    pub base_currency: String,
    pub instance_id: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            font: "default".to_string(),
            base_currency: "USD".to_string(),
            instance_id: "".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub theme: String,
    pub font: String,
    pub base_currency: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Sort {
    pub id: String,
    pub desc: bool,
}

#[derive(Queryable, Insertable, Serialize, Deserialize, Debug)]
#[diesel(table_name= crate::schema::app_settings)]
#[serde(rename_all = "camelCase")]
pub struct AppSetting {
    pub setting_key: String,
    pub setting_value: String,
}
