use crate::market_data::market_data_service::MarketDataService;
use crate::models::{Asset, AssetProfile, NewAsset, Quote, UpdateAssetProfile};
use crate::schema::{assets, quotes};
use diesel::prelude::*;
use diesel::SqliteConnection;
use log::{debug, error};
use std::sync::Arc;

pub struct AssetService {
    market_data_service: Arc<MarketDataService>,
}

impl From<yahoo_finance_api::Quote> for Quote {
    fn from(external_quote: yahoo_finance_api::Quote) -> Self {
        Quote {
            id: uuid::Uuid::new_v4().to_string(),
            created_at: chrono::Utc::now().naive_utc(),
            data_source: String::from("Yahoo"),
            date: chrono::Utc::now().naive_utc(),
            symbol: String::new(),
            open: external_quote.open,
            high: external_quote.high,
            low: external_quote.low,
            volume: external_quote.volume as f64,
            close: external_quote.close,
            adjclose: external_quote.adjclose,
        }
    }
}

impl AssetService {
    pub async fn new() -> Self {
        let market_data_service = Arc::new(MarketDataService::new().await);
        Self {
            market_data_service,
        }
    }

    pub fn get_assets(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Asset>, diesel::result::Error> {
        assets::table.load::<Asset>(conn)
    }

    pub fn get_asset_by_id(
        &self,
        conn: &mut SqliteConnection,
        asset_id: &str,
    ) -> Result<Asset, diesel::result::Error> {
        assets::table.find(asset_id).first::<Asset>(conn)
    }

    pub fn get_asset_data(
        &self,
        conn: &mut SqliteConnection,
        asset_id: &str,
    ) -> Result<AssetProfile, diesel::result::Error> {
        debug!("Fetching asset data for asset_id: {}", asset_id);

        let asset = assets::table
            .filter(assets::id.eq(asset_id))
            .first::<Asset>(conn)?;

        let quote_history = quotes::table
            .filter(quotes::symbol.eq(&asset.symbol))
            .order(quotes::date.desc())
            .load::<Quote>(conn)?;

        let asset_profile = AssetProfile {
            asset,
            quote_history,
        };

        Ok(asset_profile)
    }

    pub fn update_asset_profile(
        &self,
        conn: &mut SqliteConnection,
        asset_id: &str,
        payload: UpdateAssetProfile,
    ) -> Result<Asset, diesel::result::Error> {
        diesel::update(assets::table.filter(assets::id.eq(asset_id)))
            .set((
                assets::sectors.eq(&payload.sectors),
                assets::countries.eq(&payload.countries),
                assets::comment.eq(payload.comment),
                assets::asset_sub_class.eq(&payload.asset_sub_class),
                assets::asset_class.eq(&payload.asset_class),
            ))
            .get_result::<Asset>(conn)
    }

    pub fn load_currency_assets(
        &self,
        conn: &mut SqliteConnection,
        base_currency: &str,
    ) -> Result<Vec<Asset>, diesel::result::Error> {
        use crate::schema::assets::dsl::*;

        assets
            .filter(asset_type.eq("Currency"))
            .filter(symbol.like(format!("{}%", base_currency)))
            .load::<Asset>(conn)
    }

    pub fn create_cash_asset(
        &self,
        conn: &mut SqliteConnection,
        currency: &str,
    ) -> Result<Asset, diesel::result::Error> {
        let asset_id = format!("$CASH-{}", currency);

        let new_asset = NewAsset {
            id: asset_id.to_string(),
            isin: None,
            name: None,
            asset_type: Some("Cash".to_string()),
            symbol: asset_id.to_string(),
            symbol_mapping: None,
            asset_class: Some("CASH".to_string()),
            asset_sub_class: Some("CASH".to_string()),
            comment: None,
            countries: None,
            categories: None,
            classes: None,
            attributes: None,
            currency: currency.to_string(),
            data_source: "MANUAL".to_string(),
            sectors: None,
            url: None,
        };

        diesel::insert_into(assets::table)
            .values(&new_asset)
            .get_result::<Asset>(conn)
    }

    pub fn create_rate_exchange_asset(
        &self,
        conn: &mut SqliteConnection,
        base_currency: &str,
        target_currency: &str,
    ) -> Result<Asset, diesel::result::Error> {
        let asset_id = format!("{}{}=X", base_currency, target_currency);

        let new_asset = NewAsset {
            id: asset_id.to_string(),
            isin: None,
            name: None,
            asset_type: Some("Currency".to_string()),
            symbol: asset_id.to_string(),
            symbol_mapping: None,
            asset_class: Some("CASH".to_string()),
            asset_sub_class: Some("CASH".to_string()),
            comment: None,
            countries: None,
            categories: None,
            classes: None,
            attributes: None,
            currency: base_currency.to_string(),
            data_source: "MANUAL".to_string(),
            sectors: None,
            url: None,
        };

        diesel::insert_into(assets::table)
            .values(&new_asset)
            .get_result::<Asset>(conn)
    }

    pub fn get_latest_quote(
        &self,
        conn: &mut SqliteConnection,
        symbol: &str,
    ) -> QueryResult<Quote> {
        return self.market_data_service.get_latest_quote(conn, symbol);
    }

    pub async fn get_or_create_asset(
        &self,
        conn: &mut SqliteConnection,
        asset_id: &str,
    ) -> Result<Asset, diesel::result::Error> {
        use crate::schema::assets::dsl::*;

        match assets.find(asset_id).first::<Asset>(conn) {
            Ok(existing_profile) => Ok(existing_profile),
            Err(diesel::NotFound) => {
                error!("No asset found in database for asset_id: {}", asset_id);
                // Symbol not found in database. Try fetching info from market data service.
                match self.market_data_service.get_symbol_profile(asset_id).await {
                    // Info found. Create and return a new asset based on this info.
                    Ok(fetched_profile) => {
                        let inserted_asset = self.insert_new_asset(conn, fetched_profile).await?;

                        // Sync the quotes for the new asset
                        self.sync_asset_quotes(conn, &vec![inserted_asset.clone()])
                            .await
                            .map_err(|_e| diesel::result::Error::RollbackTransaction)?;
                        Ok(inserted_asset)
                    }
                    Err(_) => {
                        error!("No data found for asset_id: {}", asset_id);
                        Err(diesel::result::Error::NotFound)
                    }
                }
            }
            Err(e) => Err(e),
        }
    }

    async fn insert_new_asset(
        &self,
        conn: &mut SqliteConnection,
        new_asset: NewAsset,
    ) -> Result<Asset, diesel::result::Error> {
        use crate::schema::assets::dsl::*;

        let inserted_asset = diesel::insert_into(assets)
            .values(&new_asset)
            .returning(Asset::as_returning())
            .get_result(conn)?;
        Ok(inserted_asset)
    }

    pub async fn sync_asset_quotes(
        &self,
        conn: &mut SqliteConnection,
        asset_list: &Vec<Asset>,
    ) -> Result<(), String> {
        self.market_data_service
            .sync_asset_quotes(conn, asset_list)
            .await
    }
}
