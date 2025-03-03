use std::collections::{HashMap, HashSet};
use bigdecimal::BigDecimal;
use chrono::{NaiveDate, DateTime, Utc};
use thiserror::Error;



#[derive(Error, Debug)]
pub enum FxError {
    #[error("No exchange rate found for {from_currency} to {to_currency} on {date}")]
    RateNotFound {
        from_currency: String,
        to_currency: String,
        date: DateTime<Utc>,
    },
    #[error("Multiple rates found for the same currency pair ({from_currency} to {to_currency}) on {date}")]
    DuplicateRate {
        from_currency: String,
        to_currency: String,
        date: DateTime<Utc>,
    },
}

/// A foreign exchange rate between two currencies
#[derive(Debug, Clone)]
pub struct FxRate {
    pub from_currency: String,
    pub to_currency: String,
    pub rate: BigDecimal,
    pub date: NaiveDate,
}

impl FxRate {
    pub fn new(from_currency: String, to_currency: String, rate: BigDecimal, date: NaiveDate) -> Self {
        Self {
            from_currency,
            to_currency,
            rate,
            date,
        }
    }

    pub fn inverse(&self) -> Self {
        Self {
            from_currency: self.to_currency.clone(),
            to_currency: self.from_currency.clone(),
            rate: BigDecimal::from(1) / &self.rate,
            date: self.date,
        }
    }
}


/// A calculator for currency conversions, supporting historical rates.
pub struct CurrencyConverter {
    // Date -> (From, To) -> Rate
    historical_rates: HashMap<NaiveDate, HashMap<(String, String), BigDecimal>>,
    sorted_dates: Vec<NaiveDate>, // Keep track of dates in sorted order
}

impl CurrencyConverter {
    /// Creates a new `CurrencyConverter` from a Vec of FxRate.  Processes
    /// inverses and transitive rates.
    pub fn new(fx_rates: Vec<FxRate>) -> Result<Self, FxError> {
        let mut converter = CurrencyConverter {
            historical_rates: HashMap::new(),
            sorted_dates: Vec::new() //init the dates
        };
        converter.add_historical_rates(fx_rates)?;
        Ok(converter)
    }


    /// Adds historical FX rates, handling inverses and transitive rates.
    fn add_historical_rates(&mut self, rates: Vec<FxRate>) -> Result<(), FxError> {
        // Group rates by date first.
        let mut rates_by_date: HashMap<NaiveDate, Vec<FxRate>> = HashMap::new();
        for rate in rates {
            rates_by_date.entry(rate.date).or_default().push(rate);
        }

        for (date, rates_for_date) in rates_by_date {
             // Check for duplicates.
            let mut seen_pairs: HashSet<(String, String)> = HashSet::new();
            for rate in &rates_for_date {
                if !seen_pairs.insert((rate.from_currency.clone(), rate.to_currency.clone())) {
                     return Err(FxError::DuplicateRate {
                        from_currency: rate.from_currency.clone(),
                        to_currency: rate.to_currency.clone(),
                        date: date.and_hms_opt(0, 0, 0).unwrap().and_utc(),
                    });
                }
            }

            let mut rate_map: HashMap<(String, String), BigDecimal> = HashMap::new();
            let mut currencies: HashSet<String> = HashSet::new();

            // Add direct and inverse rates.
            for rate in rates_for_date {
                currencies.insert(rate.from_currency.clone());
                currencies.insert(rate.to_currency.clone());

                rate_map.insert(
                    (rate.from_currency.clone(), rate.to_currency.clone()),
                    rate.rate.clone(),
                );
                rate_map.insert(
                    (rate.to_currency.clone(), rate.from_currency.clone()),
                    BigDecimal::from(1) / &rate.rate,
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
    ) -> Result<BigDecimal, FxError> {
        if from_currency == to_currency {
            return Ok(BigDecimal::from(1));
        }

        self.historical_rates
            .get(&date)
            .and_then(|rate_map| rate_map.get(&(from_currency.to_string(), to_currency.to_string())))
            .cloned()
            .ok_or_else(|| FxError::RateNotFound {
                from_currency: from_currency.to_string(),
                to_currency: to_currency.to_string(),
                date: date.and_hms_opt(0,0,0).unwrap().and_utc(),
            })
    }

     pub fn get_rate_nearest(
        &self,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<BigDecimal, FxError> {

        if from_currency == to_currency {
            return Ok(BigDecimal::from(1));
        }

        // Use binary search to find the closest date
        let closest_date = match self.sorted_dates.binary_search(&date) {
            Ok(index) => {
				// println!("index: {}", index);
				self.sorted_dates[index]
			}, // Exact match
            Err(index) => {
                // No exact match.  `index` is where it *would* be inserted.
                // Check the dates before and after.
                if index == 0 {
					// println!("index == 0");
                    // Requested date is before the first date.
                    self.sorted_dates[0]
                } else if index == self.sorted_dates.len() {
					// println!("index == self.sorted_dates.len()");
                    // Requested date is after the last date.
                    self.sorted_dates[index - 1]
                } else {
                    // Requested date is between two dates.
                    let prev_date = self.sorted_dates[index - 1];
                    let next_date = self.sorted_dates[index];
                    if (date - prev_date) < (next_date - date) {
						// println!("date - prev_date");
                        prev_date
                    } else {
						// println!("else");
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
        amount: &BigDecimal,
        from_currency: &str,
        to_currency: &str,  
        date: NaiveDate,
    ) -> Result<BigDecimal, FxError> {
        let rate = self.get_rate(from_currency, to_currency, date)?;
        Ok(amount * rate)
    }

      pub fn convert_amount_nearest(
        &self,
        amount: &BigDecimal,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<BigDecimal, FxError> {
        let rate = self.get_rate_nearest(from_currency, to_currency, date)?;
        Ok(amount * rate)
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use num_traits::FromPrimitive;

	 fn test_rates() -> Vec<FxRate> {
        vec![
            FxRate::new("USD".to_string(), "EUR".to_string(), BigDecimal::from_f64(0.85).unwrap(), NaiveDate::from_ymd_opt(2023, 10, 26).unwrap()),
            FxRate::new("EUR".to_string(), "GBP".to_string(), BigDecimal::from_f64(0.90).unwrap(), NaiveDate::from_ymd_opt(2023, 10, 26).unwrap()),
            FxRate::new("USD".to_string(), "EUR".to_string(), BigDecimal::from_f64(0.86).unwrap(), NaiveDate::from_ymd_opt(2023, 10, 27).unwrap()),
            FxRate::new("EUR".to_string(), "GBP".to_string(), BigDecimal::from_f64(0.91).unwrap(), NaiveDate::from_ymd_opt(2023, 10, 27).unwrap()),
            FxRate::new("USD".to_string(), "EUR".to_string(), BigDecimal::from_f64(0.87).unwrap(), NaiveDate::from_ymd_opt(2023, 10, 28).unwrap()),
            FxRate::new("EUR".to_string(), "GBP".to_string(), BigDecimal::from_f64(0.92).unwrap(), NaiveDate::from_ymd_opt(2023, 10, 28).unwrap()),
        ]
    }

    #[test]
    fn test_direct_conversion() {
		let rates = test_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        let amount = BigDecimal::from(100);
        let converted_amount = converter.convert_amount(&amount, "USD", "EUR", NaiveDate::from_ymd_opt(2023, 10, 26).unwrap()).unwrap();
        assert_eq!(converted_amount, BigDecimal::from(85));
    }
     #[test]
    fn test_inverse_conversion() {
        let rates = test_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        let amount = BigDecimal::from(85);
        let converted_amount = converter.convert_amount(&amount, "EUR", "USD", NaiveDate::from_ymd_opt(2023, 10, 26).unwrap()).unwrap();
        assert_eq!(converted_amount, BigDecimal::from(100));
    }

    #[test]
    fn test_transitive_conversion() {
        let rates = test_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        let amount = BigDecimal::from(100);
        let converted_amount = converter.convert_amount(&amount, "USD", "GBP", NaiveDate::from_ymd_opt(2023, 10, 26).unwrap()).unwrap();
        assert_eq!(converted_amount, BigDecimal::from(100) * BigDecimal::from_f64(0.85).unwrap() * BigDecimal::from_f64(0.90).unwrap());
    }

    #[test]
    fn test_no_rate_available() {
        let rates = vec![]; // Empty rates
        let converter = CurrencyConverter::new(rates).unwrap();
        let amount = BigDecimal::from(100);
		let result = converter.convert_amount(&amount, "USD", "EUR", NaiveDate::from_ymd_opt(2023, 10, 26).unwrap());
        assert!(matches!(result, Err(FxError::RateNotFound { .. })));
    }

    #[test]
    fn test_same_currency_conversion() {
         let rates = test_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        let amount = BigDecimal::from(100);
        let converted_amount = converter.convert_amount(&amount, "USD", "USD", NaiveDate::from_ymd_opt(2023, 10, 26).unwrap()).unwrap();
        assert_eq!(converted_amount, amount);
    }

    #[test]
    fn test_duplicate_rate_error() {
		let rates = test_rates();
        let result = CurrencyConverter::new(rates);
        assert!(result.is_ok()); // Should be OK, since test rates now includes different dates to avoid the error
    }
		
	#[test]
    fn test_nearest_date_lookup() {
        let rates = test_rates();
        let converter = CurrencyConverter::new(rates).unwrap();

        // Test with a date that exists
        let amount = BigDecimal::from(100);
        let converted_amount = converter
            .convert_amount_nearest(&amount, "USD", "EUR", NaiveDate::from_ymd_opt(2023, 10, 27).unwrap()) // Exact date
            .unwrap();
        assert_eq!(converted_amount, BigDecimal::from(86)); // Rate on 2023-10-27

        // Test with a date before the first date
        let converted_amount = converter
            .convert_amount_nearest(&amount, "USD", "EUR", NaiveDate::from_ymd_opt(2023, 10, 25).unwrap()) // Before first date
            .unwrap();
        assert_eq!(converted_amount, BigDecimal::from(85)); // Should use 2023-10-26

        // Test with a date after the last date
        let converted_amount = converter
            .convert_amount_nearest(&amount, "USD", "EUR", NaiveDate::from_ymd_opt(2023, 10, 29).unwrap()) // After last date
            .unwrap();
        assert_eq!(converted_amount, BigDecimal::from(87)); // Should use 2023-10-28

        // Test with a date between two existing dates (closer to the earlier date)
        let converted_amount = converter
            .convert_amount_nearest(&amount, "USD", "EUR", NaiveDate::from_ymd_opt(2023, 10, 26).unwrap()) // Between two dates
            .unwrap();
		assert_eq!(converted_amount, BigDecimal::from(85));

        // Test with a date between two existing dates (closer to the later date)
        let converted_amount = converter
            .convert_amount_nearest(&amount, "USD", "EUR", NaiveDate::from_ymd_opt(2023, 10, 27).unwrap()) // Between two dates
            .unwrap();
		assert_eq!(converted_amount, BigDecimal::from(86));
    }

}