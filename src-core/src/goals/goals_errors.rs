use std::fmt;
use diesel::result::Error as DieselError;
use r2d2::Error as R2D2Error;

#[derive(Debug)]
pub enum GoalError {
    Database(DieselError),
    Pool(R2D2Error),
}

impl fmt::Display for GoalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GoalError::Database(e) => write!(f, "Database error: {}", e),
            GoalError::Pool(e) => write!(f, "Connection pool error: {}", e),
        }
    }
}

impl std::error::Error for GoalError {}

impl From<DieselError> for GoalError {
    fn from(err: DieselError) -> Self {
        GoalError::Database(err)
    }
}

impl From<R2D2Error> for GoalError {
    fn from(err: R2D2Error) -> Self {
        GoalError::Pool(err)
    }
}

pub type Result<T> = std::result::Result<T, GoalError>;
