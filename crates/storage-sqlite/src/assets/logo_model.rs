//! Database model for custom asset logos.
//!
//! Field names equal column names with no serde renames: the row is serialized
//! verbatim into the sync outbox payload and the generic sync apply path
//! rejects keys that are not table columns.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use wealthfolio_core::assets::AssetLogo;

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Serialize,
    Deserialize,
    PartialEq,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::asset_logos)]
#[diesel(primary_key(asset_id))]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct AssetLogoDB {
    pub asset_id: String,
    pub mime_type: String,
    pub data: String,
    pub sha256: String,
    pub width: i32,
    pub height: i32,
    pub created_at: String,
    pub updated_at: String,
}

impl From<AssetLogoDB> for AssetLogo {
    fn from(db: AssetLogoDB) -> Self {
        Self {
            asset_id: db.asset_id,
            mime_type: db.mime_type,
            data_base64: db.data,
            sha256: db.sha256,
            width: db.width,
            height: db.height,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<AssetLogo> for AssetLogoDB {
    fn from(logo: AssetLogo) -> Self {
        Self {
            asset_id: logo.asset_id,
            mime_type: logo.mime_type,
            data: logo.data_base64,
            sha256: logo.sha256,
            width: logo.width,
            height: logo.height,
            created_at: logo.created_at,
            updated_at: logo.updated_at,
        }
    }
}
