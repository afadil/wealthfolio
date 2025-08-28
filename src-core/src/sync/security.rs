// // sync/security.rs

// #[cfg(feature = "tls")]
// use anyhow::Context;

// #[cfg(feature = "tls")]
// use rcgen::generate_simple_self_signed;

// #[cfg(feature = "tls")]
// use sha2::{Digest, Sha256};

// /// Generate a self-signed cert for the given hostnames/IPs (placed into SANs).
// /// Returns (cert_der, key_der).
// #[cfg(feature = "tls")]
// pub fn generate_self_signed_cert_der_for(hosts: &[&str]) -> Result<(Vec<u8>, Vec<u8>), anyhow::Error> {
//     let san_list: Vec<String> = hosts.iter().map(|s| s.to_string()).collect();
//     let cert = generate_simple_self_signed(san_list).context("rcgen generate_simple_self_signed")?;

//     let cert_der = cert.serialize_der().context("serialize_der")?;
//     let key_der = cert.serialize_private_key_der();
//     Ok((cert_der, key_der))
// }

// /// Convenience for dev localhost.
// #[cfg(feature = "tls")]
// pub fn generate_self_signed_localhost_der() -> Result<(Vec<u8>, Vec<u8>), anyhow::Error> {
//     generate_self_signed_cert_der_for(&["localhost"])
// }

// /// SHA-256 fingerprint of a DER cert (AA:BB:... form). Use for pinning.
// #[cfg(feature = "tls")]
// pub fn sha256_fingerprint_der(der: &[u8]) -> String {
//     let mut h = Sha256::new();
//     h.update(der);
//     let bytes = h.finalize();
//     bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(":")
// }

// /// Optional: DER -> PEM (for display or storage).
// #[cfg(feature = "tls")]
// pub fn der_to_pem(label: &str, der: &[u8]) -> String {
//     use base64::engine::general_purpose::STANDARD as B64;
//     use base64::Engine;
//     let b64 = B64.encode(der);
//     let mut out = String::new();
//     out.push_str(&format!("-----BEGIN {}-----\n", label));
//     for chunk in b64.as_bytes().chunks(64) {
//         out.push_str(std::str::from_utf8(chunk).unwrap());
//         out.push('\n');
//     }
//     out.push_str(&format!("-----END {}-----\n", label));
//     out
// }

// /// Convert DER blobs to rustls pki_types.
// #[cfg(feature = "tls")]
// pub fn der_to_rustls(
//     cert_der: Vec<u8>,
//     key_der: Vec<u8>,
// ) -> anyhow::Result<(rustls::pki_types::CertificateDer<'static>, rustls::pki_types::PrivateKeyDer<'static>)> {
//     use rustls::pki_types::{CertificateDer, PrivateKeyDer};
//     let cert = CertificateDer::from(cert_der);
//     let key = PrivateKeyDer::try_from(key_der).context("invalid private key DER")?;
//     Ok((cert, key))
// }
