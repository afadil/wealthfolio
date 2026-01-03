use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Queryable, Insertable, Identifiable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::inflation_rates)]
#[serde(rename_all = "camelCase")]
pub struct InflationRate {
    pub id: String,
    pub country_code: String,
    pub year: i32,
    pub rate: f64,
    pub reference_date: Option<String>,
    pub data_source: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::inflation_rates)]
#[serde(rename_all = "camelCase")]
pub struct NewInflationRate {
    pub id: Option<String>,
    pub country_code: String,
    pub year: i32,
    pub rate: f64,
    pub reference_date: Option<String>,
    pub data_source: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InflationAdjustedValue {
    pub year: i32,
    pub nominal_value: f64,
    pub real_value: f64,
    pub inflation_rate: Option<f64>,
    pub cumulative_inflation: f64,
    pub reference_date: String,
}

// World Bank API response structures
// These fields are used for JSON deserialization even though they're not directly accessed
#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct WorldBankResponse(pub WorldBankMeta, pub Option<Vec<WorldBankDataPoint>>);

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct WorldBankMeta {
    pub page: i32,
    pub pages: i32,
    pub total: i32,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct WorldBankDataPoint {
    pub date: String,
    pub value: Option<f64>,
    pub country: WorldBankCountry,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct WorldBankCountry {
    pub id: String,
    pub value: String,
}
