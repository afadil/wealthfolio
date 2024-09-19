use crate::market_data::market_data_service::MarketDataService;
use crate::models::{Asset, AssetProfile, NewAsset, Quote, QuoteSummary};
use crate::schema::{assets, quotes};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;

pub struct AssetService {
    market_data_service: MarketDataService,
    pool: Pool<ConnectionManager<SqliteConnection>>,
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
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>) -> Self {
        AssetService {
            market_data_service: MarketDataService::new(pool.clone()),
            pool,
        }
    }

    pub fn get_assets(&self) -> Result<Vec<Asset>, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        assets::table.load::<Asset>(&mut conn)
    }

    pub fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        assets::table.find(asset_id).first::<Asset>(&mut conn)
    }

    pub fn get_asset_data(&self, asset_id: &str) -> Result<AssetProfile, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");

        let asset = assets::table
            .filter(assets::id.eq(asset_id))
            .first::<Asset>(&mut conn)?;

        let quote_history = quotes::table
            .filter(quotes::symbol.eq(&asset.symbol))
            .order(quotes::date.desc())
            .load::<Quote>(&mut conn)?;

        Ok(AssetProfile {
            asset,
            quote_history,
        })
    }

    pub fn load_currency_assets(
        &self,
        base_currency: &str,
    ) -> Result<Vec<Asset>, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        use crate::schema::assets::dsl::*;

        assets
            .filter(asset_type.eq("Currency"))
            .filter(symbol.like(format!("{}%", base_currency)))
            .load::<Asset>(&mut conn)
    }

    pub fn load_exchange_rates(
        &self,
        base_currency: &str,
    ) -> Result<HashMap<String, f64>, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        use crate::schema::quotes::dsl::{date, quotes, symbol};

        let mut exchange_rates = HashMap::new();
        let currency_assets = self.load_currency_assets(base_currency)?;

        for asset in currency_assets {
            let latest_quote = quotes
                .filter(symbol.eq(&asset.symbol))
                .order(date.desc())
                .first::<Quote>(&mut conn)
                .ok();

            if let Some(quote) = latest_quote {
                exchange_rates.insert(asset.symbol, quote.close);
            }
        }

        Ok(exchange_rates)
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

    pub fn get_latest_quote(&self, symbol_query: &str) -> QueryResult<Quote> {
        self.market_data_service.get_latest_quote(symbol_query)
    }

    pub fn get_history_quotes(&self) -> Result<Vec<Quote>, diesel::result::Error> {
        self.market_data_service.get_history_quotes()
    }

    pub async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, String> {
        self.market_data_service.search_symbol(query).await
    }

    pub async fn initialize_crumb_data(&self) -> Result<(), String> {
        self.market_data_service.initialize_crumb_data().await
    }

    pub async fn get_asset_profile(&self, asset_id: &str) -> Result<Asset, diesel::result::Error> {
        println!("Getting asset profile for asset_id: {}", asset_id);
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        use crate::schema::assets::dsl::*;

        match assets.find(asset_id).first::<Asset>(&mut conn) {
            Ok(existing_profile) => {
                println!("Found existing profile for asset_id: {}", asset_id);
                Ok(existing_profile)
            }
            Err(diesel::NotFound) => {
                println!("Asset profile not found in database for asset_id: {}. Fetching from market data service.", asset_id);
                let fetched_profile = self
                    .market_data_service
                    .fetch_symbol_summary(asset_id)
                    .await
                    .map_err(|e| {
                        println!(
                            "Failed to fetch symbol summary for asset_id: {}. Error: {:?}",
                            asset_id, e
                        );
                        diesel::result::Error::NotFound
                    })?;

                println!("Inserting new asset profile for asset_id: {}", asset_id);
                let inserted_asset = diesel::insert_into(assets)
                    .values(&fetched_profile)
                    .returning(Asset::as_returning())
                    .get_result(&mut conn)?;

                // Sync history quotes for the newly inserted asset
                self.market_data_service
                    .sync_history_quotes_for_all_assets(&[inserted_asset.clone()])
                    .await
                    .map_err(|e| {
                        println!(
                            "Failed to sync history quotes for asset_id: {}. Error: {:?}",
                            asset_id, e
                        );
                        diesel::result::Error::NotFound
                    })?;

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

    pub async fn sync_history_quotes_for_all_assets(&self) -> Result<(), String> {
        let asset_list = self.get_assets().map_err(|e| e.to_string())?;
        self.market_data_service
            .sync_history_quotes_for_all_assets(&asset_list)
            .await
    }

    pub async fn initialize_and_sync_quotes(&self) -> Result<(), String> {
        let asset_list = self.get_assets().map_err(|e| e.to_string())?;
        self.market_data_service
            .initialize_and_sync_quotes(&asset_list)
            .await
    }
}
