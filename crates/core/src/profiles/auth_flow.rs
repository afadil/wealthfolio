use super::{ProfileError, ProfileResult};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use uuid::Uuid;

struct Flow {
    id: Uuid,
    profile: Uuid,
    key: String,
    verifier: String,
    callback: Option<String>,
    callback_received: bool,
    created: Instant,
}
#[derive(Default)]
pub struct ProfileAuthFlows(Mutex<HashMap<String, Flow>>);
impl ProfileAuthFlows {
    pub fn set(
        &self,
        owner: &str,
        profile: Uuid,
        key: &str,
        verifier: &str,
    ) -> ProfileResult<Uuid> {
        if !key.ends_with("-code-verifier") || key.len() > 256 || verifier.len() > 2048 {
            return Err(ProfileError::Invalid("Invalid authentication flow".into()));
        }
        self.set_with_id(owner, profile, key, verifier, Uuid::new_v4())
    }
    pub fn set_with_id(
        &self,
        owner: &str,
        profile: Uuid,
        key: &str,
        verifier: &str,
        id: Uuid,
    ) -> ProfileResult<Uuid> {
        if !key.ends_with("-code-verifier") || key.len() > 256 || verifier.len() > 2048 {
            return Err(ProfileError::Invalid("Invalid authentication flow".into()));
        }
        self.0.lock().map_err(|_| ProfileError::Locked)?.insert(
            owner.into(),
            Flow {
                id,
                profile,
                key: key.into(),
                verifier: verifier.into(),
                callback: None,
                callback_received: false,
                created: Instant::now(),
            },
        );
        Ok(id)
    }
    pub fn get(&self, owner: &str, profile: Uuid, key: &str) -> ProfileResult<Option<String>> {
        let flows = self.0.lock().map_err(|_| ProfileError::Locked)?;
        Ok(flows
            .get(owner)
            .filter(|f| {
                f.profile == profile
                    && f.key == key
                    && f.created.elapsed() < Duration::from_secs(600)
            })
            .map(|f| f.verifier.clone()))
    }
    pub fn get_scoped(
        &self,
        owner: &str,
        profile: Uuid,
        key: &str,
        expected: Option<Uuid>,
    ) -> ProfileResult<Option<(Uuid, String)>> {
        let flows = self.0.lock().map_err(|_| ProfileError::Locked)?;
        Ok(flows
            .get(owner)
            .filter(|f| {
                f.profile == profile
                    && f.key == key
                    && expected.is_none_or(|id| id == f.id)
                    && f.created.elapsed() < Duration::from_secs(600)
            })
            .map(|f| (f.id, f.verifier.clone())))
    }
    pub fn remove(&self, owner: &str, profile: Uuid, expected: Option<Uuid>) -> ProfileResult<()> {
        let mut flows = self.0.lock().map_err(|_| ProfileError::Locked)?;
        if flows
            .get(owner)
            .is_some_and(|f| f.profile == profile && Some(f.id) == expected)
        {
            flows.remove(owner);
        }
        Ok(())
    }
    pub fn is_current(&self, owner: &str, profile: Uuid, id: Uuid) -> ProfileResult<bool> {
        Ok(self
            .0
            .lock()
            .map_err(|_| ProfileError::Locked)?
            .get(owner)
            .is_some_and(|f| {
                f.profile == profile && f.id == id && f.created.elapsed() < Duration::from_secs(600)
            }))
    }
    pub fn capture_native(&self, owner: &str, callback: &str) -> ProfileResult<()> {
        let id = url::Url::parse(callback)
            .ok()
            .and_then(|url| {
                url.query_pairs()
                    .chain(url::form_urlencoded::parse(
                        url.fragment().unwrap_or("").as_bytes(),
                    ))
                    .find_map(|(key, value)| {
                        if key == "wf_profile_flow" {
                            Uuid::parse_str(&value).ok()
                        } else {
                            None
                        }
                    })
            })
            .ok_or(ProfileError::Stale)?;
        self.capture(owner, id, callback)
    }
    pub fn capture(&self, owner: &str, id: Uuid, callback: &str) -> ProfileResult<()> {
        if callback.len() > 16384 || !callback.starts_with("wealthfolio://auth/") {
            return Err(ProfileError::Invalid(
                "Invalid authentication callback".into(),
            ));
        }
        let mut flows = self.0.lock().map_err(|_| ProfileError::Locked)?;
        let flow = flows
            .get_mut(owner)
            .filter(|f| {
                f.id == id && f.created.elapsed() < Duration::from_secs(600) && !f.callback_received
            })
            .ok_or(ProfileError::Stale)?;
        flow.callback_received = true;
        flow.callback = Some(callback.into());
        Ok(())
    }
    pub fn callback(&self, owner: &str, profile: Uuid) -> ProfileResult<Option<String>> {
        Ok(self
            .0
            .lock()
            .map_err(|_| ProfileError::Locked)?
            .get_mut(owner)
            .filter(|f| f.profile == profile && f.created.elapsed() < Duration::from_secs(600))
            .and_then(|f| f.callback.take()))
    }
    pub fn select(&self, owner: &str, profile: Uuid) -> ProfileResult<()> {
        self.0
            .lock()
            .map_err(|_| ProfileError::Locked)?
            .retain(|o, f| o != owner || f.profile == profile);
        Ok(())
    }
    pub fn cancel_profile(&self, profile: Uuid) -> ProfileResult<()> {
        self.0
            .lock()
            .map_err(|_| ProfileError::Locked)?
            .retain(|_, flow| flow.profile != profile);
        Ok(())
    }
    pub fn cancel(&self, owner: &str) -> ProfileResult<()> {
        self.0
            .lock()
            .map_err(|_| ProfileError::Locked)?
            .remove(owner);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn callbacks_cannot_change_profile_or_replay_after_consumption() {
        let flows = ProfileAuthFlows::default();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let id = flows
            .set("browser", a, "sb-auth-code-verifier", "secret")
            .unwrap();
        assert_eq!(
            flows.get("browser", b, "sb-auth-code-verifier").unwrap(),
            None
        );
        assert!(flows
            .capture("other", id, "wealthfolio://auth/callback?code=test")
            .is_err());
        flows
            .capture("browser", id, "wealthfolio://auth/callback?code=test")
            .unwrap();
        assert!(flows.callback("browser", b).unwrap().is_none());
        assert!(flows.callback("browser", a).unwrap().is_some());
        flows.cancel("browser").unwrap();
        assert!(flows
            .capture("browser", id, "wealthfolio://auth/callback?code=test")
            .is_err());
        flows
            .set("browser", a, "sb-auth-code-verifier", "secret")
            .unwrap();
        flows.select("browser", b).unwrap();
        assert!(flows
            .get("browser", a, "sb-auth-code-verifier")
            .unwrap()
            .is_none());
    }
    #[test]
    fn stale_cleanup_and_expired_callbacks_do_not_affect_new_flows() {
        let flows = ProfileAuthFlows::default();
        let profile = Uuid::new_v4();
        let key = "auth-code-verifier";
        let old = flows.set("browser", profile, key, "old").unwrap();
        let new = flows.set("browser", profile, key, "new").unwrap();
        flows.remove("browser", profile, Some(old)).unwrap();
        assert_eq!(
            flows
                .get_scoped("browser", profile, key, Some(new))
                .unwrap()
                .unwrap()
                .1,
            "new"
        );
        assert!(flows
            .capture("browser", old, "wealthfolio://auth/callback?code=old")
            .is_err());
        flows
            .capture("browser", new, "wealthfolio://auth/callback?code=new")
            .unwrap();
        assert!(flows.callback("browser", profile).unwrap().is_some());
        assert!(flows
            .capture("browser", new, "wealthfolio://auth/callback?code=new")
            .is_err());
        let expired = flows.set("browser", profile, key, "expired").unwrap();
        flows.0.lock().unwrap().get_mut("browser").unwrap().created =
            Instant::now() - Duration::from_secs(600);
        assert!(flows
            .capture(
                "browser",
                expired,
                "wealthfolio://auth/callback?code=expired"
            )
            .is_err());
        assert!(flows
            .get_scoped("browser", profile, key, None)
            .unwrap()
            .is_none());
    }
    #[test]
    fn a_late_native_callback_cannot_consume_another_profiles_flow() {
        let flows = ProfileAuthFlows::default();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let old = flows.set("main", a, "auth-code-verifier", "a").unwrap();
        flows.select("main", b).unwrap();
        let current = flows.set("main", b, "auth-code-verifier", "b").unwrap();
        assert!(flows
            .capture_native(
                "main",
                &format!("wealthfolio://auth/callback?code=a&wf_profile_flow={old}")
            )
            .is_err());
        assert!(flows
            .capture_native("main", "wealthfolio://auth/callback?code=uncorrelated")
            .is_err());
        flows
            .capture_native(
                "main",
                &format!("wealthfolio://auth/callback?code=b&wf_profile_flow={current}"),
            )
            .unwrap();
        assert!(flows
            .callback("main", b)
            .unwrap()
            .unwrap()
            .contains("code=b"));
    }
}
