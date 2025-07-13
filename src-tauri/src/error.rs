use serde::Serialize;

#[derive(Debug, Serialize)]
pub enum CommandError {
    ServiceError(String),
}

impl<E> From<E> for CommandError
where
    E: std::error::Error,
{
    fn from(error: E) -> Self {
        CommandError::ServiceError(error.to_string())
    }
}

pub type CommandResult<T, E = CommandError> = Result<T, E>; 