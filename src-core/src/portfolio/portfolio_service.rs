use std::sync::Arc;

use super::portfolio_model::{NewPortfolio, Portfolio, UpdatePortfolio};
use super::portfolio_repository::PortfolioRepository;
use crate::accounts::accounts_traits::AccountServiceTrait;
use crate::errors::Result;
use crate::{errors::ValidationError, Error};

/// Service for managing portfolios with business logic
pub struct PortfolioService {
    repository: Arc<PortfolioRepository>,
    account_service: Arc<dyn AccountServiceTrait>,
}

impl PortfolioService {
    /// Creates a new PortfolioService instance
    pub fn new(
        repository: Arc<PortfolioRepository>,
        account_service: Arc<dyn AccountServiceTrait>,
    ) -> Self {
        Self {
            repository,
            account_service,
        }
    }

    /// Creates a new portfolio with validation
    pub async fn create_portfolio(&self, new_portfolio: NewPortfolio) -> Result<Portfolio> {
        // Validate the portfolio data
        new_portfolio.validate()?;

        // Check if name already exists
        if self.repository.name_exists(&new_portfolio.name, None)? {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Portfolio with name '{}' already exists",
                new_portfolio.name
            ))));
        }

        // Verify all accounts exist and are active
        for account_id in &new_portfolio.account_ids {
            match self.account_service.get_account(account_id) {
                Ok(account) => {
                    if !account.is_active {
                        return Err(Error::Validation(ValidationError::InvalidInput(format!(
                            "Account '{}' is not active",
                            account.name
                        ))));
                    }
                }
                Err(_) => {
                    return Err(Error::Validation(ValidationError::InvalidInput(format!(
                        "Account with ID '{}' not found",
                        account_id
                    ))));
                }
            }
        }

        // Create the portfolio
        self.repository.create(new_portfolio).await
    }

    /// Updates an existing portfolio with validation
    pub async fn update_portfolio(&self, update_portfolio: UpdatePortfolio) -> Result<Portfolio> {
        // Validate the update data
        update_portfolio.validate()?;

        // Check if portfolio exists
        let _ = self.repository.get_by_id(&update_portfolio.id)?;

        // Check if new name conflicts with existing portfolio
        if let Some(ref new_name) = update_portfolio.name {
            if self
                .repository
                .name_exists(new_name, Some(&update_portfolio.id))?
            {
                return Err(Error::Validation(ValidationError::InvalidInput(format!(
                    "Portfolio with name '{}' already exists",
                    new_name
                ))));
            }
        }

        // Verify all accounts exist and are active if account_ids is being updated
        if let Some(ref account_ids) = update_portfolio.account_ids {
            for account_id in account_ids {
                match self.account_service.get_account(account_id) {
                    Ok(account) => {
                        if !account.is_active {
                            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                                "Account '{}' is not active",
                                account.name
                            ))));
                        }
                    }
                    Err(_) => {
                        return Err(Error::Validation(ValidationError::InvalidInput(format!(
                            "Account with ID '{}' not found",
                            account_id
                        ))));
                    }
                }
            }
        }

        // Update the portfolio
        self.repository.update(update_portfolio).await
    }

    /// Retrieves a portfolio by its ID
    pub fn get_portfolio(&self, portfolio_id: &str) -> Result<Portfolio> {
        self.repository.get_by_id(portfolio_id)
    }

    /// Lists all portfolios
    pub fn list_portfolios(&self) -> Result<Vec<Portfolio>> {
        self.repository.list()
    }

    /// Deletes a portfolio by its ID
    pub async fn delete_portfolio(&self, portfolio_id: &str) -> Result<()> {
        // Check if portfolio exists before deleting
        let _ = self.repository.get_by_id(portfolio_id)?;

        self.repository.delete(portfolio_id.to_string()).await
    }

    /// Checks if any portfolios contain a specific account
    /// Useful for warning users before deleting an account
    pub fn get_portfolios_containing_account(&self, account_id: &str) -> Result<Vec<Portfolio>> {
        let all_portfolios = self.repository.list()?;

        let matching_portfolios: Vec<Portfolio> = all_portfolios
            .into_iter()
            .filter(|portfolio| {
                if let Ok(account_ids) = portfolio.get_account_ids() {
                    account_ids.contains(&account_id.to_string())
                } else {
                    false
                }
            })
            .collect();

        Ok(matching_portfolios)
    }
}
