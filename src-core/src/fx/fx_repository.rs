use crate::models::{Asset, ExchangeRate};
use crate::schema::assets;

use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;

pub struct FxRepository;

impl FxRepository {
    pub fn get_exchange_rates(conn: &mut SqliteConnection) -> QueryResult<Vec<ExchangeRate>> {
        use crate::schema::assets::dsl as assets_dsl;

        let asset_rates: Vec<Asset> = assets_dsl::assets
            .filter(assets_dsl::asset_type.eq("Currency"))
            .load::<Asset>(conn)?;

        Ok(asset_rates
            .into_iter()
            .map(|asset| {
                let symbol_parts: Vec<&str> = asset.symbol.split('=').collect();
                ExchangeRate {
                    id: asset.id,
                    from_currency: symbol_parts[0][..3].to_string(),
                    to_currency: symbol_parts[0][3..].to_string(),
                    rate: 0.0,
                    source: asset.data_source,
                }
            })
            .collect())
    }

    pub fn update_exchange_rate(
        conn: &mut SqliteConnection,
        rate: &ExchangeRate,
    ) -> QueryResult<ExchangeRate> {
        let asset = Asset {
            id: rate.id.clone(),
            symbol: format!("{}{}=X", rate.from_currency, rate.to_currency),
            name: Some(rate.rate.to_string()),
            asset_type: Some("Currency".to_string()),
            data_source: rate.source.clone(),
            currency: rate.to_currency.clone(),
            updated_at: chrono::Utc::now().naive_utc(),
            ..Default::default()
        };

        diesel::update(assets::table.find(&asset.id))
            .set(&asset)
            .execute(conn)?;

        Ok(rate.clone())
    }
}
