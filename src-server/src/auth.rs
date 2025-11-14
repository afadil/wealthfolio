use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use argon2::{
    password_hash::{Error as PasswordHashError, PasswordHash, PasswordVerifier},
    Argon2,
};
use axum::{
    body::Body,
    extract::State,
    http::{header::AUTHORIZATION, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::main_lib::AppState;

#[derive(Clone)]
pub struct AuthConfig {
    pub password_hash: String,
    pub jwt_secret: Vec<u8>,
    pub access_token_ttl: Duration,
}

pub struct AuthManager {
    password_hash: String,
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    validation: Validation,
    token_ttl: Duration,
}

#[derive(Debug)]
pub enum AuthError {
    Unauthorized,
    InvalidCredentials,
    NotConfigured,
    Internal(String),
}

#[derive(Serialize)]
struct AuthErrorBody {
    code: u16,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
    iat: usize,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusResponse {
    pub requires_password: bool,
}

impl AuthManager {
    pub fn new(config: &AuthConfig) -> anyhow::Result<Self> {
        PasswordHash::new(&config.password_hash)?;
        let encoding_key = EncodingKey::from_secret(&config.jwt_secret);
        let decoding_key = DecodingKey::from_secret(&config.jwt_secret);
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        Ok(Self {
            password_hash: config.password_hash.clone(),
            encoding_key,
            decoding_key,
            validation,
            token_ttl: config.access_token_ttl,
        })
    }

    pub fn verify_password(&self, candidate: &str) -> Result<(), AuthError> {
        let parsed = PasswordHash::new(&self.password_hash).map_err(|e| {
            AuthError::Internal(format!("Invalid password hash configuration: {e}"))
        })?;
        Argon2::default()
            .verify_password(candidate.as_bytes(), &parsed)
            .map_err(|err| match err {
                PasswordHashError::Password => AuthError::InvalidCredentials,
                other => AuthError::Internal(format!("Password verification failed: {other}")),
            })
    }

    pub fn issue_token(&self) -> Result<String, AuthError> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AuthError::Internal("System clock is before UNIX_EPOCH".into()))?;
        let exp = now + self.token_ttl;
        let claims = Claims {
            sub: "wealthfolio-web".to_string(),
            iat: now.as_secs() as usize,
            exp: exp.as_secs() as usize,
        };
        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|e| AuthError::Internal(format!("Failed to sign token: {e}")))
    }

    pub fn validate_token(&self, token: &str) -> Result<(), AuthError> {
        decode::<Claims>(token, &self.decoding_key, &self.validation)
            .map(|_| ())
            .map_err(|err| match err.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature
                | jsonwebtoken::errors::ErrorKind::InvalidToken
                | jsonwebtoken::errors::ErrorKind::InvalidSignature
                | jsonwebtoken::errors::ErrorKind::MissingRequiredClaim(_) => {
                    AuthError::Unauthorized
                }
                other => AuthError::Internal(format!("Failed to validate token: {other:?}")),
            })
    }

    pub fn expires_in(&self) -> Duration {
        self.token_ttl
    }
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AuthError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
            AuthError::InvalidCredentials => {
                (StatusCode::UNAUTHORIZED, "Invalid password".to_string())
            }
            AuthError::NotConfigured => (
                StatusCode::NOT_FOUND,
                "Authentication is not configured for this server".to_string(),
            ),
            AuthError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };
        let body = Json(AuthErrorBody {
            code: status.as_u16(),
            message,
        });
        (status, body).into_response()
    }
}

pub fn decode_secret_key(raw: &str) -> anyhow::Result<Vec<u8>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        anyhow::bail!("JWT secret cannot be empty");
    }
    let decoded = match BASE64.decode(trimmed) {
        Ok(bytes) => bytes,
        Err(_) if trimmed.len() == 32 => trimmed.as_bytes().to_vec(),
        Err(_) => {
            anyhow::bail!("JWT secret must be base64 encoded or a 32-byte ASCII string")
        }
    };

    if decoded.len() != 32 {
        anyhow::bail!("JWT secret must decode to exactly 32 bytes");
    }

    Ok(decoded)
}

pub async fn login(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AuthError> {
    let auth = state.auth.as_ref().ok_or(AuthError::NotConfigured)?.clone();
    auth.verify_password(&payload.password)?;
    let token = auth.issue_token()?;
    Ok(Json(LoginResponse {
        access_token: token,
        token_type: "Bearer".to_string(),
        expires_in: auth.expires_in().as_secs(),
    }))
}

pub async fn auth_status(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> Json<AuthStatusResponse> {
    Json(AuthStatusResponse {
        requires_password: state.auth.is_some(),
    })
}

pub async fn require_jwt(
    State(state): State<Arc<AppState>>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, AuthError> {
    request.extensions_mut().insert(state.clone());

    let Some(auth) = state.auth.clone() else {
        return Ok(next.run(request).await);
    };

    let header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(AuthError::Unauthorized)?;

    let mut parts = header.splitn(2, ' ');
    let (Some(scheme), Some(token)) = (parts.next(), parts.next()) else {
        return Err(AuthError::Unauthorized);
    };

    if !scheme.eq_ignore_ascii_case("Bearer") {
        return Err(AuthError::Unauthorized);
    }

    let token = token.trim();
    if token.is_empty() {
        return Err(AuthError::Unauthorized);
    }

    auth.validate_token(token)?;
    Ok(next.run(request).await)
}
