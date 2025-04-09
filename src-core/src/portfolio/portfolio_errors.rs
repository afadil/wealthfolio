use thiserror::Error;
use crate::errors::Error as CoreError;

#[derive(Error, Debug)]
pub enum PortfolioError {
    #[error("Core error: {0}")]
    Core(#[from] CoreError),

    #[error("Dependency error: {service}: {message}")]
    DependencyError {
        service: String,
        message: String,
    },

    #[error("Missing data: {0}")]
    MissingData(String),

    #[error("Calculation error: {0}")]
    CalculationError(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

impl PortfolioError {
    pub fn dependency(service: &str, message: impl Into<String>) -> Self {
        PortfolioError::DependencyError {
            service: service.to_string(),
            message: message.into(),
        }
    }
} 