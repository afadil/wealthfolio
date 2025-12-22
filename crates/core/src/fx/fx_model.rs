use crate::market_data::market_data_model::{DataSource, Quote};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRate {
    pub id: String,
    pub from_currency: String,
    pub to_currency: String,
    #[serde(serialize_with = "serialize_decimal_6")]
    pub rate: Decimal,
    pub source: DataSource,
    pub timestamp: DateTime<Utc>,
}

impl ExchangeRate {
    pub fn from_quote(quote: &Quote) -> Self {
        let (from_currency, to_currency) = Self::parse_fx_symbol(&quote.symbol);

        ExchangeRate {
            id: Self::make_fx_symbol(&from_currency, &to_currency),
            from_currency,
            to_currency,
            rate: quote.close,
            source: quote.data_source.clone(),
            timestamp: quote.timestamp,
        }
    }

    pub fn to_quote(&self) -> Quote {
        let formatted_date = self.timestamp.format("%Y%m%d").to_string();
        let symbol = Self::make_fx_symbol(&self.from_currency, &self.to_currency);
        Quote {
            id: format!("{}_{}", formatted_date, symbol),
            symbol,
            timestamp: self.timestamp,
            open: self.rate,
            high: self.rate,
            low: self.rate,
            close: self.rate,
            adjclose: self.rate,
            volume: Decimal::ZERO,
            data_source: self.source.clone(),
            created_at: self.timestamp,
            currency: self.from_currency.clone(),
        }
    }

    pub fn parse_fx_symbol(symbol: &str) -> (String, String) {
        if let Some(base_symbol) = symbol.strip_suffix("=X") {
            (base_symbol[..3].to_string(), base_symbol[3..].to_string())
        } else {
            (symbol[..3].to_string(), symbol[3..6].to_string())
        }
    }

    pub fn make_fx_symbol(from: &str, to: &str) -> String {
        format!("{}{}=X", from, to)
    }
}

fn serialize_decimal_6<S>(decimal: &Decimal, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    let rounded = decimal.round_dp(6);
    serializer.serialize_str(&rounded.to_string())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewExchangeRate {
    pub from_currency: String,
    pub to_currency: String,
    #[serde(serialize_with = "serialize_decimal_6")]
    pub rate: Decimal,
    pub source: DataSource,
}

impl NewExchangeRate {
    pub fn to_quote(&self) -> Quote {
        let now = Utc::now();
        let formatted_date = now.format("%Y%m%d").to_string();
        let symbol = ExchangeRate::make_fx_symbol(&self.from_currency, &self.to_currency);
        Quote {
            id: format!("{}_{}", formatted_date, symbol),
            symbol,
            timestamp: now,
            open: self.rate,
            high: self.rate,
            low: self.rate,
            close: self.rate,
            adjclose: self.rate,
            volume: Decimal::ZERO,
            data_source: self.source.clone(),
            created_at: now,
            currency: self.from_currency.clone(),
        }
    }
}
