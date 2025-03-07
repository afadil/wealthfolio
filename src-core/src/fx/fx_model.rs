use crate::market_data::market_data_model::{DataSource, Quote};
use bigdecimal::BigDecimal;
use serde::{Deserialize, Deserializer, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRate {
    pub id: String,
    pub from_currency: String,
    pub to_currency: String,
    #[serde(
        deserialize_with = "deserialize_exchange_rate",
        serialize_with = "serialize_exchange_rate"
    )]
    pub rate: BigDecimal,
    pub source: DataSource,
    pub timestamp: chrono::NaiveDateTime,
}

impl ExchangeRate {
    pub fn from_quote(quote: &Quote) -> Self {
        let (from_currency, to_currency) = Self::parse_fx_symbol(&quote.symbol);

        ExchangeRate {
            id: Self::make_fx_symbol(&from_currency, &to_currency),
            from_currency,
            to_currency,
            rate: quote.close.clone(),
            source: quote.data_source.clone(),
            timestamp: quote.date,
        }
    }

    pub fn to_quote(&self) -> Quote {
        let formatted_date = self.timestamp.format("%Y%m%d").to_string();
        let symbol = Self::make_fx_symbol(&self.from_currency, &self.to_currency);
        Quote {
            id: format!("{}_{}", formatted_date, symbol),
            symbol,
            date: self.timestamp,
            open: self.rate.clone(),
            high: self.rate.clone(),
            low: self.rate.clone(),
            close: self.rate.clone(),
            adjclose: self.rate.clone(),
            volume: BigDecimal::from(0),
            data_source: self.source.clone(),
            created_at: self.timestamp,
            currency: self.from_currency.clone(),
        }
    }

    pub fn parse_fx_symbol(symbol: &str) -> (String, String) {
        if symbol.ends_with("=X") {
            let base_symbol = &symbol[..symbol.len() - 2];
            (base_symbol[..3].to_string(), base_symbol[3..].to_string())
        } else {
            (symbol[..3].to_string(), symbol[3..6].to_string())
        }
    }

    pub fn make_fx_symbol(from: &str, to: &str) -> String {
        format!("{}{}=X", from, to)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewExchangeRate {
    pub from_currency: String,
    pub to_currency: String,
    #[serde(
        deserialize_with = "deserialize_exchange_rate",
        serialize_with = "serialize_exchange_rate"
    )]
    pub rate: BigDecimal,
    pub source: DataSource,
}

impl NewExchangeRate {
    pub fn to_quote(&self) -> Quote {
        let now = chrono::Utc::now().naive_utc();
        let formatted_date = now.format("%Y%m%d").to_string();
        let symbol = ExchangeRate::make_fx_symbol(&self.from_currency, &self.to_currency);
        Quote {
            id: format!("{}_{}", formatted_date, symbol),
            symbol,
            date: now,
            open: self.rate.clone(),
            high: self.rate.clone(),
            low: self.rate.clone(),
            close: self.rate.clone(),
            adjclose: self.rate.clone(),
            volume: BigDecimal::from(0),
            data_source: self.source.clone(),
            created_at: now,
            currency: self.from_currency.clone(),
        }
    }
}

fn deserialize_exchange_rate<'de, D>(deserializer: D) -> Result<BigDecimal, D::Error>
where
    D: Deserializer<'de>,
{
    let decimal = BigDecimal::deserialize(deserializer)?;
    // Round to 6 decimal places for exchange rates
    Ok(decimal.with_scale(6))
}

fn serialize_exchange_rate<S>(rate: &BigDecimal, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    // Ensure rate is rounded to 6 decimal places before serializing
    rate.with_scale(6).serialize(serializer)
}
