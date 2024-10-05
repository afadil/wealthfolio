use crate::market_data::market_data_service::MarketDataService;
use crate::models::{Asset, AssetProfile, NewAsset, Quote, QuoteSummary, UpdateAssetProfile};
use crate::providers::market_data_provider::MarketDataError;
use crate::schema::{assets, quotes};
use diesel::prelude::*;
use diesel::SqliteConnection;
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
        println!("Fetching asset data for asset_id: {}", asset_id);

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
    ) -> Result<(), diesel::result::Error> {
        diesel::update(assets::table.filter(assets::id.eq(asset_id)))
            .set((
                assets::sectors.eq(&payload.sectors),
                assets::countries.eq(&payload.countries),
                assets::comment.eq(payload.comment),
                assets::asset_sub_class.eq(&payload.asset_sub_class),
            ))
            .execute(conn)?;
        Ok(())
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

    pub fn create_exchange_rate_symbols(
        &self,
        conn: &mut SqliteConnection,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut symbols = Vec::new();
        if from_currency != to_currency {
            symbols.push(format!("{}{}=X", from_currency, to_currency));
            symbols.push(format!("{}{}=X", to_currency, from_currency));
        }
        if from_currency != "USD" {
            symbols.push(format!("{}USD=X", from_currency));
        }

        let new_assets: Vec<NewAsset> = symbols
            .iter()
            .filter(|symbol| self.get_asset_by_id(conn, symbol).is_err())
            .map(|symbol| NewAsset {
                id: symbol.to_string(),
                isin: None,
                name: None,
                asset_type: Some("Currency".to_string()),
                symbol: symbol.to_string(),
                symbol_mapping: None,
                asset_class: Some("".to_string()),
                asset_sub_class: Some("".to_string()),
                comment: None,
                countries: None,
                categories: None,
                classes: None,
                attributes: None,
                currency: to_currency.to_string(),
                data_source: "MANUAL".to_string(),
                sectors: None,
                url: None,
            })
            .collect();

        diesel::replace_into(assets::table)
            .values(&new_assets)
            .execute(conn)?;

        Ok(())
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
        symbol_query: &str,
    ) -> QueryResult<Quote> {
        self.market_data_service
            .get_latest_quote(conn, symbol_query)
    }

    pub fn get_history_quotes(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Quote>, diesel::result::Error> {
        self.market_data_service.get_history_quotes(conn)
    }

    pub async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        self.market_data_service.search_symbol(query).await
    }

    pub async fn get_asset_profile(
        &self,
        conn: &mut SqliteConnection,
        asset_id: &str,
        sync: Option<bool>,
    ) -> Result<Asset, diesel::result::Error> {
        use crate::schema::assets::dsl::*;

        let should_sync = sync.unwrap_or(true);

        match assets.find(asset_id).first::<Asset>(conn) {
            Ok(existing_profile) => Ok(existing_profile),
            Err(diesel::NotFound) => {
                // symbol not found in database. Fetching from market data service.
                let fetched_profile = self
                    .market_data_service
                    .get_symbol_profile(asset_id)
                    .await
                    .map_err(|e| {
                        println!(
                            "Failed to fetch symbol summary for asset_id: {}. Error: {:?}",
                            asset_id, e
                        );
                        diesel::result::Error::NotFound
                    })?;

                let inserted_asset = diesel::insert_into(assets)
                    .values(&fetched_profile)
                    .returning(Asset::as_returning())
                    .get_result(conn)?;

                if should_sync {
                    self.sync_symbol_quotes(conn, &[inserted_asset.symbol.clone()])
                        .await
                        .map_err(|e| {
                            println!(
                                "Failed to sync quotes for asset_id: {}. Error: {:?}",
                                asset_id, e
                            );
                            diesel::result::Error::NotFound
                        })?;
                }

                Ok(inserted_asset)
            }
            Err(e) => {
                println!(
                    "Error while getting asset profile for asset_id: {}. Error: {:?}",
                    asset_id, e
                );
                Err(e)
            }
        }
    }

    pub async fn sync_symbol_quotes(
        &self,
        conn: &mut SqliteConnection,
        symbols: &[String],
    ) -> Result<(), String> {
        self.market_data_service.sync_quotes(conn, symbols).await
    }
}
