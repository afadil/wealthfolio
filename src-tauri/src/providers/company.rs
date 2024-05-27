// use reqwest::header::{HeaderMap, COOKIE};
// use reqwest::Client;

// async fn fetch_company_profile() -> Result<String, reqwest::Error> {
//     let client = Client::new();

//     // Make the first call to extract the Crumb cookie
//     let response = client
//         .get("https://finance.yahoo.com/quote/MSFT/profile?p=MSFT")
//         .send()
//         .await?;

//     // Extract the Crumb cookie from the response headers
//     let headers = response.headers();
//     let crumb_cookie = headers
//         .get("Set-Cookie")
//         .and_then(|cookie| cookie.to_str().ok())
//         .and_then(|cookie| cookie.split(';').next())
//         .and_then(|cookie| cookie.strip_prefix("B="))
//         .unwrap_or("");

//     //https://query1.finance.yahoo.com/v1/test/getcrumb
//     Ok(crumb_cookie.to_string())
// }

// use async_std::sync::Arc;
// use futures::future::BoxFuture;

// use super::*;
// use crate::api::model::CompanyData;
// use crate::YAHOO_CRUMB;

// /// Returns a companies profile information. Only needs to be returned once.
// pub struct Company {
//     symbol: String,
// }

// impl Company {
//     pub fn new(symbol: String) -> Company {
//         Company { symbol }
//     }
// }

// impl AsyncTask for Company {
//     type Input = String;
//     type Response = CompanyData;

//     fn update_interval(&self) -> Option<Duration> {
//         None
//     }

//     fn input(&self) -> Self::Input {
//         self.symbol.clone()
//     }

//     fn task<'a>(input: Arc<Self::Input>) -> BoxFuture<'a, Option<Self::Response>> {
//         Box::pin(async move {
//             let symbol = input.as_ref();

//             let crumb = YAHOO_CRUMB.read().clone();

//             if let Some(crumb) = crumb {
//                 crate::CLIENT.get_company_data(symbol, crumb).await.ok()
//             } else {
//                 None
//             }
//         })
//     }
// }
