use async_trait::async_trait;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, NaiveDateTime, Utc};
use openssl::ec::EcKey;
use openssl::pkey::PKey;
use rand::rngs::OsRng;
use rand::RngCore;
use reqwest::{Client, Method, Url};
use ring::rand::SystemRandom;
use ring::signature::{EcdsaKeyPair, ECDSA_P256_SHA256_FIXED_SIGNING};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::brokers::broker_provider::{BrokerApiConfig, BrokerError, BrokerProvider, ExternalActivity};

use log::debug;

const V2_PREFIX: &str = "/v2";
const V3_PREFIX: &str = "/api/v3/brokerage";
const DEFAULT_LIMIT: usize = 25;
const USER_AGENT: &str = "Wealthfolio";

#[derive(Clone)]
struct Jwt {
    api_key: String,
    signing_key: Arc<EcdsaKeyPair>,
    rng: SystemRandom,
}

#[derive(Serialize)]
struct JwtHeader<'a> {
    alg: &'a str,
    kid: String,
    nonce: String,
}

#[derive(Serialize)]
struct JwtPayload<'a> {
    sub: String,
    iss: &'a str,
    nbf: u64,
    exp: u64,
    uri: Option<String>,
}

impl Jwt {
    pub fn new(api_key: String, pem_bytes: &[u8]) -> Result<Self, BrokerError> {
        let secret_der = Self::format_key(pem_bytes)?;
        let rng = SystemRandom::new();
        let signing_key = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &secret_der)
            .map_err(|e| BrokerError::Key(e.to_string()))?;
        Ok(Jwt { api_key, signing_key: Arc::new(signing_key), rng })
    }

    fn format_key(key: &[u8]) -> Result<Vec<u8>, BrokerError> {
        let ec = EcKey::private_key_from_pem(key)
            .map_err(|e| BrokerError::Key(e.to_string()))?;
        let pkey = PKey::from_ec_key(ec).map_err(|e| BrokerError::Key(e.to_string()))?;
        let der = pkey.private_key_to_pkcs8().map_err(|e| BrokerError::Key(e.to_string()))?;
        Ok(der)
    }

    fn build_header(&self) -> Result<String, BrokerError> {
        let mut nonce_bytes = [0u8; 48];
        OsRng.fill_bytes(&mut nonce_bytes);
        let header = JwtHeader { alg: "ES256", kid: self.api_key.clone(), nonce: URL_SAFE_NO_PAD.encode(&nonce_bytes) };
        let raw = serde_json::to_vec(&header).map_err(|e| BrokerError::Unknown(e.to_string()))?;
        let b64 = URL_SAFE_NO_PAD.encode(&raw);
        Ok(b64)
    }

    fn build_payload(&self, uri: &str) -> Result<String, BrokerError> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| BrokerError::Unknown(e.to_string()))?
            .as_secs();
        let payload = JwtPayload { sub: self.api_key.clone(), iss: "cdp", nbf: now, exp: now + 120, uri: Some(uri.to_owned()) };
        let raw = serde_json::to_vec(&payload).map_err(|e| BrokerError::Unknown(e.to_string()))?;
        let b64 = URL_SAFE_NO_PAD.encode(&raw);
        Ok(b64)
    }

    fn sign(&self, message: &[u8]) -> Result<String, BrokerError> {
        let sig = self.signing_key.sign(&self.rng, message).map_err(|e| BrokerError::Key(e.to_string()))?;
        let b64 = URL_SAFE_NO_PAD.encode(sig.as_ref());
        Ok(b64)
    }

    pub fn encode(&self, method: &str, host: &str, path: &str) -> Result<String, BrokerError> {
        let uri = format!("{} {}{}", method, host, path);
        let header_b64 = self.build_header()?;
        let payload_b64 = self.build_payload(&uri)?;
        let mut token = format!("{}.{}", header_b64, payload_b64);
        let signature = self.sign(token.as_bytes())?;
        token.push('.');
        token.push_str(&signature);
        Ok(token)
    }
}

pub struct CoinbaseClient {
    host: String,
    jwt: Jwt,
    client: Client,
}

impl CoinbaseClient {
    pub fn new(api_key: String, api_secret_pem: &[u8], host: String) -> Result<Self, BrokerError> {
        let jwt = Jwt::new(api_key.clone(), api_secret_pem)?;
        Ok(Self {
            host,
            jwt,
            client: Client::new(),
        })
    }

    async fn request(&self, method: Method, path: &str, params: Option<&HashMap<&str, String>>)
        -> Result<Value, BrokerError>
    {
        let token = self.jwt.encode(method.as_str(), &self.host, path)?;
        let url = Url::parse(&format!("https://{}{}", self.host, path))
            .map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?;
        debug!("Fetching data from: {:?}", url.path());
        let mut req = self.client
            .request(method, url)
            .header("Content-Type", "application/json")
            .header("User-Agent", USER_AGENT)
            .bearer_auth(token);
        if let Some(q) = params {
            req = req.query(q);
        }
        let resp = req.send().await.map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?;

        if status == 401 {
            return Err(BrokerError::AuthenticationFailed("Unauthorized".into()));
        } else if !status.is_success() {
            return Err(BrokerError::ApiRequestFailed(format!("{}: {}", status, text)));
        }
        serde_json::from_str(&text).map_err(|e| BrokerError::Unknown(e.to_string()))
    }

    async fn paginate(&self, method: Method, path: &str, mut params: HashMap<&str,String>) -> Result<Vec<Value>, BrokerError> {
        if !params.contains_key("limit") {
        params.insert("limit", DEFAULT_LIMIT.to_string());
        }
        let is_v3 = path.starts_with(V3_PREFIX);

        let mut pages = Vec::new();
        loop {
            let page = self.request(method.clone(), path, Some(&params)).await?;
            pages.push(page.clone());

            let has_next = page.get("has_next")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
            if !has_next { break; }

            let token = page.get("cursor")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| BrokerError::ApiRequestFailed(
                            "Missing cursor on next page".into()))?;
            let key = if is_v3 { "cursor" } else { "starting_after" };
            params.insert(key, token.to_owned());
        }
        Ok(pages)
    }

    pub async fn get_all_accounts(&self) -> Result<Vec<Value>, BrokerError> {
        let pages = self.paginate(Method::GET, &format!("{}{}", V3_PREFIX, "/accounts"), HashMap::new()).await?;
        let mut all = Vec::new();
        for p in pages {
            if let Some(arr) = p.get("accounts").and_then(|v| v.as_array()) {
                all.extend(arr.clone());
            }
        }
        Ok(all)
    }

    pub async fn get_all_transactions(&self, account_id: &str) -> Result<Vec<Value>, BrokerError> {
        let path = format!("{}{}", V2_PREFIX, format!("/accounts/{}/transactions", account_id));
        let pages = self.paginate(Method::GET, &path, HashMap::new()).await?;
        let mut all = Vec::new();
        for p in pages {
            if let Some(arr) = p.get("data").and_then(|v| v.as_array()) {
                all.extend(arr.clone());
            }
        }
        Ok(all)
    }
}

pub struct CoinbaseProvider {
    inner: CoinbaseClient,
}

impl CoinbaseProvider {
    pub async fn new(config: BrokerApiConfig) -> Result<Self, BrokerError> {
        let secret = config.api_key;
        let key = config.optional
            .ok_or(BrokerError::MissingApiData)?;
        let client = CoinbaseClient::new(key.clone(), &secret.replace("\\n", "\n").into_bytes(), "api.coinbase.com".into())
            .map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?;
        Ok(Self { inner: client })
    }
}

#[async_trait]
impl BrokerProvider for CoinbaseProvider {
    async fn fetch_activities(&self, since: NaiveDateTime) -> Result<Vec<ExternalActivity>, BrokerError> {
        let accounts = self.inner.get_all_accounts()
            .await
            .map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?;

        let mut out = Vec::new();
        let since_ms = since.and_utc().timestamp_millis();

        for acct in accounts {
            if let Some(aid) = acct.get("uuid").and_then(|v| v.as_str()) {
                let txs = self.inner.get_all_transactions(aid)
                    .await
                    .map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?;

                for tx in txs {
                    let ts_str = tx.get("created_at")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| BrokerError::ApiRequestFailed("missing created_at".into()))?;
                    let dt: DateTime<Utc> = DateTime::parse_from_rfc3339(ts_str)
                        .map_err(|e| BrokerError::ApiRequestFailed(e.to_string()))?
                        .with_timezone(&Utc);
                    if dt.timestamp_millis() <= since_ms + 1000 {
                        continue;
                    }
                    if tx.get("status").unwrap() != "completed" { continue; }
                    let coin_ticker = tx.get("amount")
                        .and_then(|amt| amt.get("currency"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    let fiat_currency = tx.get("native_amount")
                        .and_then(|na| na.get("currency"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let coin_num: f64 = tx.get("amount")
                        .and_then(|amt| amt.get("amount"))
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<f64>().ok())
                        .filter(|n| n.is_finite())
                        .unwrap_or(0.0);

                    let in_cash: f64 = tx.get("native_amount")
                        .and_then(|na| na.get("amount"))
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<f64>().ok())
                        .filter(|n| n.is_finite())
                        .map(|n| n.abs())
                        .unwrap_or(0.0);

                    let fee_str = tx.get("network")
                        .and_then(|n| n.get("transaction_fee")).and_then(|f| f.get("amount"))
                        .or_else(|| tx.get("trade").and_then(|t| t.get("fee")).and_then(|f| f.get("amount")))
                        .or_else(|| tx.get("buy").and_then(|b| b.get("fee")).and_then(|f| f.get("amount")))
                        .or_else(|| tx.get("advanced_trade_fill").and_then(|a| a.get("commission")))
                        .and_then(|v| v.as_str())
                        .unwrap_or("0.0");
                    let fees: f64 = fee_str.parse().unwrap_or(0.0);

                    let comment = tx.get("details")
                        .and_then(|d| d.get("title"))
                        .and_then(|v| v.as_str())
                        .map(String::from)
                        .or_else(|| {
                            tx.get("buy")
                            .and_then(|b| b.get("payment_method_name"))
                            .and_then(|v| v.as_str())
                            .map(|s| format!("via {}", s))
                        });

                    let ty = tx
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or("UNKNOWN")
                        .to_uppercase();

                    let activity_type = map_transaction(&ty, coin_num);
                    if activity_type == "CONTINUE" { continue; }

                    let cost_price: f64 = if coin_num.abs() > std::f64::EPSILON {
                        in_cash / coin_num
                    } else {
                        0.0
                    };

                    out.push(ExternalActivity {
                        symbol: make_symbol(&coin_ticker, &fiat_currency),
                        activity_type,
                        quantity: coin_num.abs(),
                        price: cost_price.abs(),
                        timestamp: dt.naive_utc(),
                        currency: Some(fiat_currency),
                        fee: Some(fees),
                        comment,
                    });
                }
            }
        }
        Ok(out)
    }
}

pub fn make_symbol(coin: &str, fiat: &str) -> String {
    if coin == fiat {
        return format!("$CASH-{}", fiat);
    }
    let base = match coin {
        "ETH2" => "ETH",
        other => other,
    };
    format!("{}-{}", base, fiat)
}

pub fn map_transaction(activity: &str, coin_num: f64) -> String {
    let mapped = match activity {
        "TRADE"
        | "ADVANCED_TRADE_FILL"
        | "BUY"
        | "SEND" if coin_num > 0.0 => "BUY",
        "TRADE"
        | "ADVANCED_TRADE_FILL"
        | "BUY"
        | "SELL"
        | "SEND" => "SELL",
        "EARN_PAYOUT"
        | "STAKING_REWARD"
        | "INCENTIVES_REWARDS_PAYOUT"
        | "SUBSCRIPTION_REBATE" => "DIVIDEND",
        "FIAT_DEPOSIT"
        | "DEPOSIT"
        | "INTERNAL_DEPOSIT"
        | "EXCHANGE_DEPOSIT"
        | "ONCHAIN_DEPOSIT"
        | "SWEEP_DEPOSIT"
        | "INTX_DEPOSIT"
        | "RECEIVE"
        | "UNSUPPORTED_ASSET_RECOVERY"
            => "DEPOSIT",
        "CLAWBACK"
        | "INCENTIVES_SHARED_CLAWBACK" => "DEPOSIT",
        "RETAIL_SIMPLE_DUST" if coin_num > 0.0 => "DEPOSIT",
        "REQUEST" if coin_num > 0.0 => "DEPOSIT",
        "STAKING_TRANSFER"
        | "UNSTAKING_TRANSFER"
        | "WRAP_ASSET"
        | "UNWRAP_ASSET" if coin_num > 0.0 => "DEPOSIT",
        "DERIVATIVES_SETTLEMENT"
        | "TRANSFER" if coin_num > 0.0 => "DEPOSIT",
        "EXCHANGE_WITHDRAWAL"
        | "INTERNAL_WITHDRAWAL"
        | "FIAT_WITHDRAWAL"
        | "WITHDRAWAL"
        | "ONCHAIN_WITHDRAWAL"
        | "SWEEP_WITHDRAWAL"
        | "INTX_WITHDRAWAL"
        | "VAULT_WITHDRAWAL"
        | "SUBSCRIPTION"  
            => "WITHDRAWAL",
        "RETAIL_SIMPLE_DUST" => "WITHDRAWAL",
        "REQUEST" if coin_num < 0.0 => "WITHDRAWAL",
        "STAKING_TRANSFER"
        | "UNSTAKING_TRANSFER"
        | "WRAP_ASSET"
        | "UNWRAP_ASSET" if coin_num < 0.0 => "SELL",
        "DERIVATIVES_SETTLEMENT"
        | "TRANSFER" if coin_num < 0.0 => "WITHDRAWAL",
        "RETAIL_ETH2_DEPRECATION" => "CONTINUE",
        other => other, // thios case should never happen but is included in case Coinbase decides to add more activity types (such that no activities are missed)
    };
    mapped.to_string()
}
