use chrono::NaiveDateTime;
use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Queryable, Insertable, Identifiable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::contribution_limits)]
#[serde(rename_all = "camelCase")]
pub struct ContributionLimit {
    pub id: String,
    pub group_name: String,
    pub contribution_year: i32,
    pub limit_amount: f64,
    pub account_ids: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::contribution_limits)]
#[serde(rename_all = "camelCase")]
pub struct NewContributionLimit {
    pub id: Option<String>,
    pub group_name: String,
    pub contribution_year: i32,
    pub limit_amount: f64,
    pub account_ids: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccountDeposit {
    pub amount: Decimal,
    pub currency: String,
    pub converted_amount: Decimal,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DepositsCalculation {
    pub total: Decimal,
    pub base_currency: String,
    pub by_account: HashMap<String, AccountDeposit>,
}
