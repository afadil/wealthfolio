use crate::fx::fx_errors::FxError;
use crate::fx::fx_model::ExchangeRate;
use chrono::NaiveDate;
use rust_decimal::Decimal;
use std::collections::{HashMap, HashSet};

/// A calculator for currency conversions, supporting historical rates based on the latest rate per day.
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

    /// Adds historical FX rates, processing inverses and transitive rates.
    /// For each day, only the latest available rate for a given pair is considered.
    fn add_historical_rates(&mut self, rates: Vec<ExchangeRate>) -> Result<(), FxError> {
        // Group rates by date and select the latest timestamp for each pair within that date.
        let mut latest_rates_by_date: HashMap<NaiveDate, HashMap<(String, String), ExchangeRate>> =
            HashMap::new();

        for rate in rates {
            // No longer mutable, no normalization
            // Preserve original case
            // let from_currency = rate.from_currency.clone();
            // let to_currency = rate.to_currency.clone();

            // Ignore self-referential rates
            if rate.from_currency == rate.to_currency {
                continue;
            }

            let date = rate.timestamp.date_naive(); // Group by NaiveDate
                                                    // Use original case for the pair key
            let pair = (rate.from_currency.clone(), rate.to_currency.clone());

            let date_map = latest_rates_by_date.entry(date).or_default();

            // Check if we have a rate for this pair on this date, keep the latest timestamp
            match date_map.entry(pair) {
                std::collections::hash_map::Entry::Occupied(mut entry) => {
                    // Duplicate pair found for this date, keep the one with the later timestamp
                    if rate.timestamp > entry.get().timestamp {
                        *entry.get_mut() = rate; // Update with the later rate
                    }
                    // Else, discard the current 'rate' as it's earlier or same timestamp
                }
                std::collections::hash_map::Entry::Vacant(entry) => {
                    // No rate for this pair on this date yet, insert this one
                    entry.insert(rate);
                }
            }
        }

        // Clear existing processed rates before adding new ones based on daily latest
        self.historical_rates.clear();
        self.sorted_dates.clear();

        // Now process the latest rates selected for each date
        for (date, chosen_rates_for_date) in latest_rates_by_date {
            // The chosen_rates_for_date map now contains only the latest rate per pair for this date.
            let mut rate_map: HashMap<(String, String), Decimal> = HashMap::new();
            let mut currencies: HashSet<String> = HashSet::new();

            // Add direct and inverse rates from the chosen rates.
            for (_pair, rate) in chosen_rates_for_date {
                // Use original case preserved in 'rate'
                currencies.insert(rate.from_currency.clone());
                currencies.insert(rate.to_currency.clone());

                let forward_rate = rate.rate;
                // Check for zero rate before division
                if forward_rate.is_zero() {
                    // Decide how to handle zero rate (e.g., log error, skip inverse)
                    log::error!(
                        "Zero exchange rate encountered for {}/{} on {}. Cannot calculate inverse.",
                        rate.from_currency,
                        rate.to_currency,
                        date
                    );
                    // Insert forward rate but skip inverse
                    rate_map.insert(
                        (rate.from_currency.clone(), rate.to_currency.clone()),
                        forward_rate,
                    );
                    continue; // Skip inverse calculation for this rate
                }
                let inverse_rate = Decimal::ONE / forward_rate;

                rate_map.insert(
                    (rate.from_currency.clone(), rate.to_currency.clone()), // Use original case
                    forward_rate,
                );
                rate_map.insert(
                    (rate.to_currency.clone(), rate.from_currency.clone()), // Use original case
                    inverse_rate,
                );
            }

            // Build transitive rates (logic remains the same)
            let currencies_vec: Vec<_> = currencies.into_iter().collect();
            for i in 0..currencies_vec.len() {
                for j in 0..currencies_vec.len() {
                    if i == j {
                        // Add identity rate
                        rate_map.insert(
                            (currencies_vec[i].clone(), currencies_vec[j].clone()),
                            Decimal::ONE,
                        );
                        continue;
                    }
                    let from = &currencies_vec[i];
                    let to = &currencies_vec[j];

                    if !rate_map.contains_key(&(from.clone(), to.clone())) {
                        // Try to find a transitive path
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
                                // Add inverse transitive rate as well
                                if !transitive_rate.is_zero() {
                                    rate_map.insert(
                                        (to.clone(), from.clone()),
                                        Decimal::ONE / transitive_rate,
                                    );
                                } else {
                                    log::warn!("Zero transitive rate calculated for {}->{} via {} on {}. Cannot store inverse.", from, to, via, date);
                                }
                                // Found *a* path, break inner loop to avoid redundant calculations for this pair?
                                // Or let it run to potentially find a more direct path later? Current logic allows override.
                                // break; // Optional: break if one path is enough
                            }
                        }
                    }
                }
            }
            // Add identity rates again just in case they were missed
            for currency in &currencies_vec {
                rate_map
                    .entry((currency.clone(), currency.clone()))
                    .or_insert(Decimal::ONE);
            }

            self.historical_rates.insert(date, rate_map);
            // Add date in sorted insert (logic remains the same)
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
                    // Compare differences in days
                    if (date - prev_date).num_days() < (next_date - date).num_days() {
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
    use chrono::{NaiveDate, TimeZone, Utc};

    fn test_exchange_rates() -> Vec<ExchangeRate> {
        // Helper to create DateTime<Utc> from NaiveDate
        let dt = |y, m, d, h, min, s| {
            Utc.from_utc_datetime(
                &NaiveDate::from_ymd_opt(y, m, d)
                    .unwrap()
                    .and_hms_opt(h, min, s)
                    .unwrap(),
            )
        };

        vec![
            // Date 1: USD/EUR has two rates, EUR/GBP has one
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("USD", "EUR"),
                from_currency: "USD".to_string(),
                to_currency: "EUR".to_string(),
                rate: Decimal::new(84, 2), // Earlier rate
                source: DataSource::Manual,
                timestamp: dt(2023, 10, 26, 10, 0, 0),
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("USD", "EUR"),
                from_currency: "USD".to_string(),
                to_currency: "EUR".to_string(),
                rate: Decimal::new(85, 2), // LATEST rate for this pair on this day
                source: DataSource::Manual,
                timestamp: dt(2023, 10, 26, 15, 0, 0),
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("EUR", "GBP"),
                from_currency: "EUR".to_string(),
                to_currency: "GBP".to_string(),
                rate: Decimal::new(90, 2),
                source: DataSource::Manual,
                timestamp: dt(2023, 10, 26, 12, 0, 0), // Only rate for this pair/day
            },
            // Date 2: Only one rate per pair
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("USD", "EUR"),
                from_currency: "USD".to_string(),
                to_currency: "EUR".to_string(),
                rate: Decimal::new(86, 2),
                source: DataSource::Manual,
                timestamp: dt(2023, 10, 27, 11, 0, 0),
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("EUR", "GBP"),
                from_currency: "EUR".to_string(),
                to_currency: "GBP".to_string(),
                rate: Decimal::new(91, 2),
                source: DataSource::Manual,
                timestamp: dt(2023, 10, 27, 13, 0, 0),
            },
            // Date 3: EUR/GBP latest rate is different
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("USD", "EUR"),
                from_currency: "USD".to_string(),
                to_currency: "EUR".to_string(),
                rate: Decimal::new(87, 2),
                source: DataSource::Manual,
                timestamp: dt(2023, 10, 28, 9, 0, 0),
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("EUR", "GBP"),
                from_currency: "EUR".to_string(),
                to_currency: "GBP".to_string(),
                rate: Decimal::new(915, 3), // 0.915, earlier
                source: DataSource::Manual,
                timestamp: dt(2023, 10, 28, 10, 0, 0),
            },
            ExchangeRate {
                id: ExchangeRate::make_fx_symbol("EUR", "GBP"),
                from_currency: "EUR".to_string(),
                to_currency: "GBP".to_string(),
                rate: Decimal::new(92, 2), // LATEST rate
                source: DataSource::Manual,
                timestamp: dt(2023, 10, 28, 16, 0, 0),
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
        assert_eq!(converted_amount, Decimal::new(85, 0));
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
        assert_eq!(
            converted_amount,
            Decimal::ONE_HUNDRED * Decimal::new(85, 2) * Decimal::new(90, 2)
        );
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
        assert_eq!(converted_amount, Decimal::new(86, 0)); // Rate on 2023-10-27

        // Test with a date before the first date
        let date_before = NaiveDate::from_ymd_opt(2023, 10, 25).unwrap();
        let converted_amount = converter
            .convert_amount_nearest(amount.clone(), "USD", "EUR", date_before)
            .unwrap();
        assert_eq!(converted_amount, Decimal::new(85, 0)); // Should use 2023-10-26

        // Test with a date after the last date
        let date_after = NaiveDate::from_ymd_opt(2023, 10, 29).unwrap();
        let converted_amount = converter
            .convert_amount_nearest(amount.clone(), "USD", "EUR", date_after)
            .unwrap();
        assert_eq!(converted_amount, Decimal::new(87, 0)); // Should use 2023-10-28
    }
}
