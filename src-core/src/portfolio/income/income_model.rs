use crate::activities::activities_model::IncomeData;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Cash income data from cash accounts (deposits, salary, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashIncomeData {
    pub date: String,
    pub activity_type: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub category_color: Option<String>,
    pub sub_category_id: Option<String>,
    pub sub_category_name: Option<String>,
    pub account_id: String,
    pub account_name: String,
    pub currency: String,
    pub amount: Decimal,
    pub name: Option<String>,
}

/// Deposit data from investment accounts (SECURITIES, CRYPTO)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentAccountDepositData {
    pub date: String,
    pub account_id: String,
    pub account_name: String,
    pub account_type: String,
    pub currency: String,
    pub amount: Decimal,
}

/// Capital gains data from SELL activities
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapitalGainsData {
    pub date: String,
    pub symbol: String,
    pub symbol_name: String,
    pub currency: String,
    pub sale_proceeds: Decimal,
    pub cost_basis: Decimal,
    pub gain_amount: Decimal,
}

/// Source type breakdown for income visualization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceTypeBreakdown {
    pub source_type: String,
    pub amount: Decimal,
    pub percentage: Decimal,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeSummary {
    pub period: String,
    pub by_month: HashMap<String, Decimal>,
    pub by_type: HashMap<String, Decimal>,
    pub by_symbol: HashMap<String, Decimal>,
    pub by_currency: HashMap<String, Decimal>,
    pub by_month_by_source_type: HashMap<String, HashMap<String, Decimal>>, // Month -> SourceType -> Amount (for stacked bar charts)
    pub by_month_by_symbol: HashMap<String, HashMap<String, Decimal>>, // Month -> Symbol -> Amount (for filtering chart by symbol)
    pub total_income: Decimal,
    pub investment_income: Decimal,
    pub cash_income: Decimal,
    pub capital_gains: Decimal,
    pub investment_deposits: Decimal,
    pub currency: String,
    pub monthly_average: Decimal,
    pub yoy_growth: Option<Decimal>,
    pub by_source_type: Vec<SourceTypeBreakdown>,
}

impl IncomeSummary {
    pub fn new(period: &str, currency: String) -> Self {
        IncomeSummary {
            period: period.to_string(),
            by_month: HashMap::new(),
            by_type: HashMap::new(),
            by_symbol: HashMap::new(),
            by_currency: HashMap::new(),
            by_month_by_source_type: HashMap::new(),
            by_month_by_symbol: HashMap::new(),
            total_income: Decimal::ZERO,
            investment_income: Decimal::ZERO,
            cash_income: Decimal::ZERO,
            capital_gains: Decimal::ZERO,
            investment_deposits: Decimal::ZERO,
            currency,
            monthly_average: Decimal::ZERO,
            yoy_growth: None,
            by_source_type: Vec::new(),
        }
    }

    /// Add investment income (dividends, interest from securities)
    pub fn add_income(&mut self, data: &IncomeData, converted_amount: Decimal) {
        *self
            .by_month
            .entry(data.date.to_string())
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;

        // Aggregate by month and source type (for stacked bar charts)
        let month_sources = self
            .by_month_by_source_type
            .entry(data.date.to_string())
            .or_insert_with(HashMap::new);
        *month_sources
            .entry("Investment Income".to_string())
            .or_insert(Decimal::ZERO) += &converted_amount;

        // Aggregate by month and symbol (for filtering chart by symbol)
        let symbol_key = format!("[{}]-{}", data.symbol, data.symbol_name);
        let month_symbols = self
            .by_month_by_symbol
            .entry(data.date.to_string())
            .or_insert_with(HashMap::new);
        *month_symbols
            .entry(symbol_key.clone())
            .or_insert(Decimal::ZERO) += &converted_amount;

        *self
            .by_type
            .entry(data.income_type.clone())
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self
            .by_symbol
            .entry(symbol_key)
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self
            .by_currency
            .entry(data.currency.clone())
            .or_insert_with(|| Decimal::ZERO) += &data.amount;
        self.total_income += &converted_amount;
        self.investment_income += &converted_amount;
    }

    /// Add cash income (salary, deposits with income categories)
    pub fn add_cash_income(&mut self, data: &CashIncomeData, converted_amount: Decimal) {
        *self
            .by_month
            .entry(data.date.to_string())
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;

        // Aggregate by month and source type (for stacked bar charts)
        let month_sources = self
            .by_month_by_source_type
            .entry(data.date.to_string())
            .or_insert_with(HashMap::new);
        *month_sources
            .entry("Cash Income".to_string())
            .or_insert(Decimal::ZERO) += &converted_amount;

        // Use category name for type if available, otherwise use activity type
        let income_type = data.category_name.clone()
            .unwrap_or_else(|| data.activity_type.clone());
        *self
            .by_type
            .entry(income_type)
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;

        // Build display name from category/subcategory for cash income
        let display_name = match (&data.category_name, &data.sub_category_name) {
            (Some(cat), Some(sub)) => format!("{} > {}", cat, sub),
            (Some(cat), None) => cat.clone(),
            _ => data.account_name.clone(),
        };
        let symbol_key = format!("[$CASH]-{}", display_name);

        // Aggregate by month and symbol (for filtering chart by symbol)
        let month_symbols = self
            .by_month_by_symbol
            .entry(data.date.to_string())
            .or_insert_with(HashMap::new);
        *month_symbols
            .entry(symbol_key.clone())
            .or_insert(Decimal::ZERO) += &converted_amount;

        *self
            .by_symbol
            .entry(symbol_key)
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self
            .by_currency
            .entry(data.currency.clone())
            .or_insert_with(|| Decimal::ZERO) += &data.amount;
        self.total_income += &converted_amount;
        self.cash_income += &converted_amount;
    }

    /// Add investment account deposit (deposits to SECURITIES/CRYPTO accounts)
    pub fn add_investment_deposit(&mut self, data: &InvestmentAccountDepositData, converted_amount: Decimal) {
        *self
            .by_month
            .entry(data.date.to_string())
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;

        // Aggregate by month and source type (for stacked bar charts)
        let month_sources = self
            .by_month_by_source_type
            .entry(data.date.to_string())
            .or_insert_with(HashMap::new);
        *month_sources
            .entry("Account Deposits".to_string())
            .or_insert(Decimal::ZERO) += &converted_amount;

        // Use account type for the by_type breakdown
        *self
            .by_type
            .entry(format!("{} Deposits", data.account_type))
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;

        // Build display name from account name/type for deposits
        let symbol_key = format!("[$ACCT]-{} > {}", data.account_name, data.account_type);

        // Aggregate by month and symbol (for filtering chart by symbol)
        let month_symbols = self
            .by_month_by_symbol
            .entry(data.date.to_string())
            .or_insert_with(HashMap::new);
        *month_symbols
            .entry(symbol_key.clone())
            .or_insert(Decimal::ZERO) += &converted_amount;

        *self
            .by_symbol
            .entry(symbol_key)
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self
            .by_currency
            .entry(data.currency.clone())
            .or_insert_with(|| Decimal::ZERO) += &data.amount;
        self.total_income += &converted_amount;
        self.investment_deposits += &converted_amount;
    }

    /// Add capital gains from SELL activities
    pub fn add_capital_gains(&mut self, data: &CapitalGainsData, converted_gain: Decimal) {
        // Only add positive gains to income
        if converted_gain > Decimal::ZERO {
            *self
                .by_month
                .entry(data.date.to_string())
                .or_insert_with(|| Decimal::ZERO) += &converted_gain;

            // Aggregate by month and source type (for stacked bar charts)
            let month_sources = self
                .by_month_by_source_type
                .entry(data.date.to_string())
                .or_insert_with(HashMap::new);
            *month_sources
                .entry("Capital Gains".to_string())
                .or_insert(Decimal::ZERO) += &converted_gain;

            // Aggregate by month and symbol (for filtering chart by symbol)
            let symbol_key = format!("[{}]-{}", data.symbol, data.symbol_name);
            let month_symbols = self
                .by_month_by_symbol
                .entry(data.date.to_string())
                .or_insert_with(HashMap::new);
            *month_symbols
                .entry(symbol_key.clone())
                .or_insert(Decimal::ZERO) += &converted_gain;

            *self
                .by_type
                .entry("Capital Gains".to_string())
                .or_insert_with(|| Decimal::ZERO) += &converted_gain;
            *self
                .by_symbol
                .entry(symbol_key)
                .or_insert_with(|| Decimal::ZERO) += &converted_gain;
            *self
                .by_currency
                .entry(data.currency.clone())
                .or_insert_with(|| Decimal::ZERO) += &data.gain_amount;
            self.total_income += &converted_gain;
            self.capital_gains += &converted_gain;
        }
    }

    pub fn calculate_monthly_average(&mut self, num_months: Option<u32>) {
        let months = num_months.unwrap_or(self.by_month.len() as u32);
        if months > 0 {
            self.monthly_average = self.total_income / Decimal::new(months as i64, 0);
        }
    }

    /// Calculate source type breakdown (investment income + capital gains combined, cash income, account deposits)
    pub fn calculate_source_type_breakdown(&mut self) {
        self.by_source_type.clear();

        if self.total_income > Decimal::ZERO {
            let hundred = Decimal::new(100, 0);

            // Combine investment income and capital gains into "Investment Income"
            let combined_investment = self.investment_income + self.capital_gains;
            if combined_investment > Decimal::ZERO {
                self.by_source_type.push(SourceTypeBreakdown {
                    source_type: "Investment Income".to_string(),
                    amount: combined_investment,
                    percentage: (combined_investment / self.total_income) * hundred,
                });
            }

            if self.cash_income > Decimal::ZERO {
                self.by_source_type.push(SourceTypeBreakdown {
                    source_type: "Cash Income".to_string(),
                    amount: self.cash_income,
                    percentage: (self.cash_income / self.total_income) * hundred,
                });
            }

            if self.investment_deposits > Decimal::ZERO {
                self.by_source_type.push(SourceTypeBreakdown {
                    source_type: "Account Deposits".to_string(),
                    amount: self.investment_deposits,
                    percentage: (self.investment_deposits / self.total_income) * hundred,
                });
            }
        }
    }
}
