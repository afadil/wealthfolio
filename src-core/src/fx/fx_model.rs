use serde::{Deserialize, Serialize};
use crate::market_data::market_data_model::{Quote, DataSource}; 

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRate {
    pub id: String,
    pub from_currency: String,
    pub to_currency: String,
    pub rate: f64,
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
            rate: quote.close,
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
            open: self.rate,
            high: self.rate,
            low: self.rate,
            close: self.rate,
            adjclose: self.rate,
            volume: 0.0,
            data_source: self.source.clone(),
            created_at: self.timestamp,
            currency: None,
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
    pub rate: f64,
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
            open: self.rate,
            high: self.rate,
            low: self.rate,
            close: self.rate,
            adjclose: self.rate,
            volume: 0.0,
            data_source: self.source.clone(),
            created_at: now,
            currency: None,
        }
    }
}
