use diesel::prelude::*;
use crate::schema::{cash_holdings, lots, positions};

// --- Position DB Model ---
#[derive(Queryable, Insertable, Identifiable, AsChangeset, Debug, Clone)]
#[diesel(table_name = positions)] 
pub struct PositionDb {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub currency: String,
    pub quantity: String,
    pub average_cost: String,
    pub total_cost_basis: String,
    pub inception_date: String,
    pub last_updated: String,
}

// --- Lot DB Model ---
#[derive(Queryable, Insertable, Identifiable, AsChangeset, Associations, Debug, Clone)]
#[diesel(table_name = lots)]      
#[diesel(belongs_to(PositionDb, foreign_key = position_id))] // Belongs_to uses struct name
pub struct LotDb {
    pub id: String,
    pub position_id: String,
    pub acquisition_date: String,
    pub quantity: String,
    pub cost_basis: String,
    pub acquisition_price: String,
    pub acquisition_fees: String,
    pub last_updated: String,
}

// --- Cash Holding DB Model ---
#[derive(Queryable, Insertable, Identifiable, AsChangeset, Debug, Clone)]
#[diesel(table_name = cash_holdings)]
pub struct CashHoldingDb {
    pub id: String,
    pub account_id: String,
    pub currency: String,
    pub amount: String,
    pub last_updated: String,
}