use zeroconf::{MdnsService, MdnsBrowser, ServiceType, TxtRecord, prelude::*};
use log::{warn, info};

pub fn advertise(device_id: &str, port: u16) -> anyhow::Result<MdnsService> {
    let ty = ServiceType::new("_wealthfolio", "_tcp")?;
    let mut service = MdnsService::new(ty, port);
    let mut txt = TxtRecord::new();
    txt.insert("id", device_id)?;
    txt.insert("app", "wealthfolio")?;
    txt.insert("schema", "1")?;
    service.set_txt_record(txt);
    service.set_name("Wealthfolio");
    
    // Try to register the service
    match service.register() {
        Ok(_) => {
            info!("mDNS service registered successfully on port {}", port);
            Ok(service)
        }
        Err(e) => {
            // Log the specific error but don't fail the entire sync engine
            warn!("mDNS service registration failed: {} (code: {:?})", e, e);
            warn!("This is non-critical - sync will still work via manual peer configuration");
            
            // Return a dummy service that won't actually advertise
            // This allows the sync engine to continue running
            Ok(service)
        }
    }
}

pub fn browse(on_peer: impl Fn(String, std::net::SocketAddr) + Send + 'static) -> anyhow::Result<MdnsBrowser> {
    let ty = ServiceType::new("_wealthfolio", "_tcp")?;
    let mut browser = MdnsBrowser::new(ty);
    browser.set_service_discovered_callback(Box::new(move |result, _context| {
        if let Ok(event) = result {
            if let Some(txt) = event.txt() {
                if let Some(id) = txt.get("id") {
                    if let Ok(addr) = format!("{}:{}", event.host_name(), event.port()).parse::<std::net::SocketAddr>() {
                        on_peer(id.to_string(), addr);
                    }
                }
            }
        }
    }));
    Ok(browser)
}



// use zeroconf::{MdnsService, ServiceType, TxtRecord, prelude::*};

// #[derive(Debug)]
// pub struct Discovery {
//     service: MdnsService,
// }

// impl Discovery {
//     pub fn new() -> Self {
//         let service = MdnsService::new(ServiceType::new("myapp", "tcp").unwrap(), 8080);
//         Self { service }
//     }

//     pub async fn advertise(&mut self) -> Result<(), anyhow::Error> {
//     let mut txt = TxtRecord::new();
//     txt.insert("version", "1");

//         self.service.set_txt_record(txt);
//         self.service.set_name("Wealthfolio Sync");

//         let _service_ref = self.service.register()?;

//         // Keep the service running
//         loop {
//             tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
//         }
//     }
// }



