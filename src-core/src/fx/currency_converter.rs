use crate::fx::fx_errors::FxError;
use crate::fx::fx_model::ExchangeRate;
use rust_decimal::Decimal;
use chrono::NaiveDate;
use std::collections::{HashMap, HashSet};

/// A calculator for currency conversions, supporting historical rates.
pub struct CurrencyConverter {
    // Date -> (From, To) -> Rate
    historical_rates: HashMap<NaiveDate, HashMap<(String, String), Decimal>>,
    sorted_dates: Vec<NaiveDate>, // Keep track of dates in sorted order
}

impl CurrencyConverter {
    /// Creates a new `CurrencyConverter` from a Vec of ExchangeRate.
    /// Processes inverses and transitive rates.
    pub fn new(exchange_rates: Vec<ExchangeRate>) -> Result<Self, FxError> {
        let mut converter = CurrencyConverter {
            historical_rates: HashMap::new(),
            sorted_dates: Vec::new(), //init the dates
        };
        converter.add_historical_rates(exchange_rates)?;
        Ok(converter)
    }

    /// Adds historical FX rates, handling inverses and transitive rates.
    fn add_historical_rates(&mut self, rates: Vec<ExchangeRate>) -> Result<(), FxError> {
        // Group rates by date first.
        let mut rates_by_date: HashMap<NaiveDate, Vec<ExchangeRate>> = HashMap::new();
        for rate in rates {
            let date = rate.timestamp.date();
            rates_by_date.entry(date).or_default().push(rate);
        }

        for (date, rates_for_date) in rates_by_date {
            // Check for duplicates.
            let mut seen_pairs: HashSet<(String, String)> = HashSet::new();
            for rate in &rates_for_date {
                if !seen_pairs.insert((rate.from_currency.clone(), rate.to_currency.clone())) {
                    return Err(FxError::ConversionError(format!(
                        "Multiple rates found for the same currency pair ({} to {}) on {}",
                        rate.from_currency, rate.to_currency, date
                    )));
                }
            }

            let mut rate_map: HashMap<(String, String), Decimal> = HashMap::new();
            let mut currencies: HashSet<String> = HashSet::new();

            // Add direct and inverse rates.
            for rate in rates_for_date {
                currencies.insert(rate.from_currency.clone());
                currencies.insert(rate.to_currency.clone());

                let forward_rate = rate.rate;
                let inverse_rate = Decimal::ONE / forward_rate;
                
                rate_map.insert(
                    (rate.from_currency.clone(), rate.to_currency.clone()),
                    forward_rate,
                );
                rate_map.insert(
                    (rate.to_currency.clone(), rate.from_currency.clone()),
                    inverse_rate,
                );
            }

            // Build transitive rates.
            let currencies_vec: Vec<_> = currencies.into_iter().collect();
            for i in 0..currencies_vec.len() {
                for j in 0..currencies_vec.len() {
                    if i == j {
                        continue;
                    }
                    let from = &currencies_vec[i];
                    let to = &currencies_vec[j];

                    if !rate_map.contains_key(&(from.clone(), to.clone())) {
                        for k in 0..currencies_vec.len() {
                            if k == i || k == j {
                                continue;
                            }
                            let via = &currencies_vec[k];

                            if let (Some(rate1), Some(rate2)) = (
                                rate_map.get(&(from.clone(), via.clone())),
                                rate_map.get(&(via.clone(), to.clone())),
                            ) {
                                let transitive_rate = rate1 * rate2;
                                rate_map.insert((from.clone(), to.clone()), transitive_rate);
                                // No break; find all possible transitive paths.
                            }
                        }
                    }
                }
            }
            self.historical_rates.insert(date, rate_map);
            // Add date in sorted insert
            if !self.sorted_dates.contains(&date) {
                self.sorted_dates.push(date);
                self.sorted_dates.sort();
            }
        }
        Ok(())
    }

    /// Gets the exchange rate between two currencies on a specific date.
    pub fn get_rate(
        &self,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal, FxError> {
        if from_currency == to_currency {
            return Ok(Decimal::ONE);
        }

        self.historical_rates
            .get(&date)
            .and_then(|rate_map| {
                rate_map.get(&(from_currency.to_string(), to_currency.to_string()))
            })
            .cloned()
            .ok_or_else(|| {
                FxError::RateNotFound(format!(
                    "No exchange rate found for {}/{} on {}",
                    from_currency, to_currency, date
                ))
            })
    }

    /// Gets the exchange rate between two currencies on the nearest available date.
    pub fn get_rate_nearest(
        &self,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal, FxError> {
        if from_currency == to_currency {
            return Ok(Decimal::ONE);
        }

        // Check if we have any dates at all
        if self.sorted_dates.is_empty() {
            return Err(FxError::RateNotFound(format!(
                "No exchange rates available for any date for {}/{}",
                from_currency, to_currency
            )));
        }

        // Use binary search to find the closest date
        let closest_date = match self.sorted_dates.binary_search(&date) {
            Ok(index) => self.sorted_dates[index], // Exact match
            Err(index) => {
                // No exact match. `index` is where it *would* be inserted.
                // Check the dates before and after.
                if index == 0 {
                    // Requested date is before the first date.
                    self.sorted_dates[0]
                } else if index == self.sorted_dates.len() {
                    // Requested date is after the last date.
                    self.sorted_dates[index - 1]
                } else {
                    // Requested date is between two dates.
                    let prev_date = self.sorted_dates[index - 1];
                    let next_date = self.sorted_dates[index];
                    if (date - prev_date) < (next_date - date) {
                        prev_date
                    } else {
                        next_date
                    }
                }
            }
        };

        // Use the existing get_rate function with the closest date
        self.get_rate(from_currency, to_currency, closest_date)
    }

    /// Converts an amount from one currency to another on a specific date.
    pub fn convert_amount(
        &self,
        amount: Decimal,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal, FxError> {
        if from_currency == to_currency {
            return Ok(amount);
        }

        let rate = self.get_rate(from_currency, to_currency, date)?;
        Ok(amount * rate)
    }

    /// Converts an amount from one currency to another on the nearest available date.
    pub fn convert_amount_nearest(
        &self,
        amount: Decimal,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal, FxError> {
        if from_currency == to_currency {
            return Ok(amount);
        }

        let rate = self.get_rate_nearest(from_currency, to_currency, date)?;
        Ok(amount * rate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::market_data::market_data_model::DataSource;
    use chrono::NaiveDate;

    fn test_exchange_rates() -> Vec<ExchangeRate> {
        let date1 = NaiveDate::from_ymd_opt(2023, 10, 26)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let date2 = NaiveDate::from_ymd_opt(2023, 10, 27)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let date3 = NaiveDate::from_ymd_opt(2023, 10, 28)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();

        vec![
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("USD", "EUR"),
                from_currency: "USD".to_string(),
                to_currency: "EUR".to_string(),
                rate: Decimal::from(85),
                source: DataSource::Manual,
                timestamp: date1,
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("EUR", "GBP"),
                from_currency: "EUR".to_string(),
                to_currency: "GBP".to_string(),
                rate: Decimal::from(90),
                source: DataSource::Manual,
                timestamp: date1,
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("USD", "EUR"),
                from_currency: "USD".to_string(),
                to_currency: "EUR".to_string(),
                rate: Decimal::from(86),
                source: DataSource::Manual,
                timestamp: date2,
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("EUR", "GBP"),
                from_currency: "EUR".to_string(),
                to_currency: "GBP".to_string(),
                rate: Decimal::from(91),
                source: DataSource::Manual,
                timestamp: date2,
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("USD", "EUR"),
                from_currency: "USD".to_string(),
                to_currency: "EUR".to_string(),
                rate: Decimal::from(87),
                source: DataSource::Manual,
                timestamp: date3,
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("EUR", "GBP"),
                from_currency: "EUR".to_string(),
                to_currency: "GBP".to_string(),
                rate: Decimal::from(92),
                source: DataSource::Manual,
                timestamp: date3,
            },
        ]
    }

    #[test]
    fn test_direct_conversion() {
        let rates = test_exchange_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        let amount = Decimal::ONE_HUNDRED;
        let date = NaiveDate::from_ymd_opt(2023, 10, 26).unwrap();
        let converted_amount = converter
            .convert_amount(amount, "USD", "EUR", date)
            .unwrap();
        assert_eq!(converted_amount, Decimal::from(85));
    }

    #[test]
    fn test_inverse_conversion() {
        let rates = test_exchange_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        let amount = Decimal::from(85);
        let date = NaiveDate::from_ymd_opt(2023, 10, 26).unwrap();
        let converted_amount = converter
            .convert_amount(amount, "EUR", "USD", date)
            .unwrap();
        assert_eq!(converted_amount, Decimal::ONE_HUNDRED);
    }

    #[test]
    fn test_transitive_conversion() {
        let rates = test_exchange_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        let amount = Decimal::ONE_HUNDRED;
        let date = NaiveDate::from_ymd_opt(2023, 10, 26).unwrap();
        let converted_amount = converter
            .convert_amount(amount, "USD", "GBP", date)
            .unwrap();
        assert_eq!(converted_amount, Decimal::ONE_HUNDRED * Decimal::from(85) * Decimal::from(90));
    }

    #[test]
    fn test_no_rate_available() {
        let rates = vec![]; // Empty rates
        let converter = CurrencyConverter::new(rates).unwrap();
        let amount = Decimal::ONE_HUNDRED;
        let date = NaiveDate::from_ymd_opt(2023, 10, 26).unwrap();
        let result = converter.convert_amount(amount, "USD", "EUR", date);
        assert!(matches!(result, Err(FxError::RateNotFound(_))));
    }

    #[test]
    fn test_same_currency_conversion() {
        let rates = test_exchange_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        let amount = Decimal::ONE_HUNDRED;
        let date = NaiveDate::from_ymd_opt(2023, 10, 26).unwrap();
        let converted_amount = converter
            .convert_amount(amount.clone(), "USD", "USD", date)
            .unwrap();
        assert_eq!(converted_amount, amount);
    }

    #[test]
    fn test_nearest_date_lookup() {
        let rates = test_exchange_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        // Test with a date that exists
        let amount = Decimal::ONE_HUNDRED;
        let date_exact = NaiveDate::from_ymd_opt(2023, 10, 27).unwrap();
        let converted_amount = converter
            .convert_amount_nearest(amount.clone(), "USD", "EUR", date_exact)
            .unwrap();
        assert_eq!(converted_amount, Decimal::from(86)); // Rate on 2023-10-27

        // Test with a date before the first date
        let date_before = NaiveDate::from_ymd_opt(2023, 10, 25).unwrap();
        let converted_amount = converter
            .convert_amount_nearest(amount.clone(), "USD", "EUR", date_before)
            .unwrap();
        assert_eq!(converted_amount, Decimal::from(85)); // Should use 2023-10-26

        // Test with a date after the last date
        let date_after = NaiveDate::from_ymd_opt(2023, 10, 29).unwrap();
        let converted_amount = converter
            .convert_amount_nearest(amount.clone(), "USD", "EUR", date_after)
            .unwrap();
        assert_eq!(converted_amount, Decimal::from(87)); // Should use 2023-10-28
    }
}
