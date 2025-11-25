use crate::addons::models::*;
use crate::addons::service::*;

#[test]
fn test_detect_addon_permissions_hello_world() {
    // Test with actual hello world addon content
    let hello_world_content = r#"
import { type AddonContext } from '@wealthfolio/addon-sdk';
import React from 'react';
import { AlertsIcon } from './icons';

export default function enable(ctx: AddonContext) {
  console.log('🚀 Hello World addon is being enabled!');
  
  const addedItems: Array<{ remove: () => void }> = [];

  const sidebarItem = ctx.sidebar.addItem({
    id: 'hello-world',
    label: 'Hello World',
    icon: <AlertsIcon className="h-5 w-5" />,
    route: '/addon/hello-world',
    order: 100
  });
  addedItems.push(sidebarItem);

  ctx.router.add({
    path: '/addon/hello-world',
    component: React.lazy(() => Promise.resolve({ default: HelloWorldWrapper }))
  });

  ctx.onDisable(() => {
    console.log('🛑 Hello World addon is being disabled');
    addedItems.forEach(item => {
      item.remove();
    });
  });
}
        "#;

    let addon_files = vec![AddonFile {
        name: "addon.tsx".to_string(),
        content: hello_world_content.to_string(),
        is_main: true,
    }];

    let detected_permissions = detect_addon_permissions(&addon_files);

    println!(
        "Hello World detected permissions: {:#?}",
        detected_permissions
    );

    // Should detect UI functions
    let ui_permission = detected_permissions.iter().find(|p| p.category == "ui");
    assert!(
        ui_permission.is_some(),
        "UI permissions should be detected in hello world addon"
    );

    let ui_permission = ui_permission.unwrap();
    let ui_functions: Vec<&str> = ui_permission
        .functions
        .iter()
        .map(|f| f.name.as_str())
        .collect();
    println!("UI functions detected: {:?}", ui_functions);
    assert!(
        ui_functions.contains(&"sidebar.addItem"),
        "sidebar.addItem should be detected in hello world"
    );
    assert!(
        ui_functions.contains(&"router.add"),
        "router.add should be detected in hello world"
    );
    assert!(
        ui_functions.contains(&"onDisable"),
        "onDisable should be detected in hello world"
    );

    // Should NOT detect portfolio or market-data functions
    let portfolio_permission = detected_permissions
        .iter()
        .find(|p| p.category == "portfolio");
    assert!(
        portfolio_permission.is_none(),
        "Portfolio permissions should NOT be detected in hello world addon"
    );

    let market_permission = detected_permissions
        .iter()
        .find(|p| p.category == "market-data");
    assert!(
        market_permission.is_none(),
        "Market-data permissions should NOT be detected in hello world addon"
    );
}

#[test]
fn test_detect_addon_permissions() {
    // Create test addon files that use various functions
    let addon_files = vec![
        AddonFile {
            name: "addon.js".to_string(),
            content: r#"
                ctx.sidebar.addItem({ id: 'test' });
                ctx.router.add({ path: '/test' });
                ctx.onDisable(() => { console.log('disabled'); });
                ctx.api.portfolio.getHoldings();
                ctx.api.portfolio.getHolding();
            "#
            .to_string(),
            is_main: true,
        },
        AddonFile {
            name: "helper.js".to_string(),
            content: r#"
                function helper() {
                    return ctx.api.market.searchTicker('AAPL');
                }
            "#
            .to_string(),
            is_main: false,
        },
    ];

    let detected_permissions = detect_addon_permissions(&addon_files);

    println!("Detected permissions: {:#?}", detected_permissions);

    // Should detect UI functions
    let ui_permission = detected_permissions.iter().find(|p| p.category == "ui");
    assert!(ui_permission.is_some(), "UI permissions should be detected");

    let ui_permission = ui_permission.unwrap();
    let ui_functions: Vec<&str> = ui_permission
        .functions
        .iter()
        .map(|f| f.name.as_str())
        .collect();
    assert!(
        ui_functions.contains(&"sidebar.addItem"),
        "sidebar.addItem should be detected"
    );
    assert!(
        ui_functions.contains(&"router.add"),
        "router.add should be detected"
    );
    assert!(
        ui_functions.contains(&"onDisable"),
        "onDisable should be detected"
    );

    // Should detect portfolio functions
    let portfolio_permission = detected_permissions
        .iter()
        .find(|p| p.category == "portfolio");
    assert!(
        portfolio_permission.is_some(),
        "Portfolio permissions should be detected"
    );

    let portfolio_permission = portfolio_permission.unwrap();
    let portfolio_functions: Vec<&str> = portfolio_permission
        .functions
        .iter()
        .map(|f| f.name.as_str())
        .collect();
    assert!(
        portfolio_functions.contains(&"getHoldings"),
        "getHoldings should be detected"
    );
    assert!(
        portfolio_functions.contains(&"getHolding"),
        "getHolding should be detected"
    );

    // Should detect market-data functions
    let market_permission = detected_permissions
        .iter()
        .find(|p| p.category == "market-data");
    assert!(
        market_permission.is_some(),
        "Market data permissions should be detected"
    );

    let market_permission = market_permission.unwrap();
    let market_functions: Vec<&str> = market_permission
        .functions
        .iter()
        .map(|f| f.name.as_str())
        .collect();
    assert!(
        market_functions.contains(&"searchTicker"),
        "searchTicker should be detected"
    );
}

#[test]
fn test_addon_manifest_to_installed() {
    let manifest = AddonManifest {
        id: "test-addon".to_string(),
        name: "Test Addon".to_string(),
        version: "1.0.0".to_string(),
        description: Some("A test addon".to_string()),
        author: Some("Test Author".to_string()),
        sdk_version: Some("1.0.0".to_string()),
        main: Some("addon.js".to_string()),
        enabled: None,
        permissions: None,
        homepage: None,
        repository: None,
        license: None,
        min_wealthfolio_version: None,
        keywords: None,
        icon: None,
        installed_at: None,
        updated_at: None,
        source: None,
        size: None,
    };

    let installed = manifest.to_installed(true).unwrap();
    assert_eq!(installed.is_enabled(), true);
    assert!(installed.installed_at.is_some());
    assert_eq!(installed.source, Some("local".to_string()));
}

#[test]
fn test_addon_manifest_get_main() {
    let manifest = AddonManifest {
        id: "test-addon".to_string(),
        name: "Test Addon".to_string(),
        version: "1.0.0".to_string(),
        description: None,
        author: None,
        sdk_version: None,
        main: Some("addon.js".to_string()),
        enabled: None,
        permissions: None,
        homepage: None,
        repository: None,
        license: None,
        min_wealthfolio_version: None,
        keywords: None,
        icon: None,
        installed_at: None,
        updated_at: None,
        source: None,
        size: None,
    };

    assert_eq!(manifest.get_main().unwrap(), "addon.js");

    let manifest_no_main = AddonManifest {
        id: "test-addon".to_string(),
        name: "Test Addon".to_string(),
        version: "1.0.0".to_string(),
        description: None,
        author: None,
        sdk_version: None,
        main: None,
        enabled: None,
        permissions: None,
        homepage: None,
        repository: None,
        license: None,
        min_wealthfolio_version: None,
        keywords: None,
        icon: None,
        installed_at: None,
        updated_at: None,
        source: None,
        size: None,
    };

    assert!(manifest_no_main.get_main().is_err());
}

#[test]
fn test_function_permission_helpers() {
    let permission = AddonPermission {
        category: "ui".to_string(),
        purpose: "User interface access".to_string(),
        functions: vec![
            FunctionPermission {
                name: "sidebar.addItem".to_string(),
                is_declared: true,
                is_detected: true,
                detected_at: Some("2023-01-01T00:00:00Z".to_string()),
            },
            FunctionPermission {
                name: "router.add".to_string(),
                is_declared: false,
                is_detected: true,
                detected_at: Some("2023-01-01T00:00:00Z".to_string()),
            },
            FunctionPermission {
                name: "showNotification".to_string(),
                is_declared: true,
                is_detected: false,
                detected_at: None,
            },
        ],
    };

    let declared = get_declared_functions(&permission);
    assert_eq!(declared.len(), 2);
    assert!(declared.contains(&"sidebar.addItem".to_string()));
    assert!(declared.contains(&"showNotification".to_string()));

    let detected = get_detected_functions(&permission);
    assert_eq!(detected.len(), 2);
    assert!(detected.contains(&"sidebar.addItem".to_string()));
    assert!(detected.contains(&"router.add".to_string()));

    let undeclared_detected = get_undeclared_detected_functions(&permission);
    assert_eq!(undeclared_detected.len(), 1);
    assert!(undeclared_detected.contains(&"router.add".to_string()));

    assert!(has_undeclared_detected_functions(&permission));
}

#[test]
fn test_permission_merging_during_installation() {
    // Create a mock addon with declared permissions
    let declared_permissions = vec![
        AddonPermission {
            category: "ui".to_string(),
            purpose: "User interface access".to_string(),
            functions: vec![
                FunctionPermission {
                    name: "showNotification".to_string(),
                    is_declared: true,
                    is_detected: false,
                    detected_at: None,
                },
                FunctionPermission {
                    name: "sidebar.addItem".to_string(),
                    is_declared: true,
                    is_detected: false,
                    detected_at: None,
                },
            ],
        },
        AddonPermission {
            category: "portfolio".to_string(),
            purpose: "Portfolio data access".to_string(),
            functions: vec![FunctionPermission {
                name: "getHoldings".to_string(),
                is_declared: true,
                is_detected: false,
                detected_at: None,
            }],
        },
    ];

    // Create addon files that use some declared and some undeclared functions
    let addon_files = vec![AddonFile {
        name: "addon.tsx".to_string(),
        content: r#"
                // Use declared functions
                ctx.sidebar.addItem({ id: 'test' });
                ctx.getHoldings();
                
                // Use undeclared functions
                ctx.router.add({ path: '/test' });
                ctx.onDisable(() => {});
            "#
        .to_string(),
        is_main: true,
    }];

    // Detect permissions
    let detected_permissions = detect_addon_permissions(&addon_files);

    // Simulate the merging logic from install_addon_zip
    let mut merged_permissions = Vec::new();

    // First, add all declared permissions with their original flags preserved
    for perm in &declared_permissions {
        let mut cloned_functions = Vec::new();
        for func in &perm.functions {
            cloned_functions.push(FunctionPermission {
                name: func.name.clone(),
                is_declared: func.is_declared,
                is_detected: func.is_detected,
                detected_at: func.detected_at.clone(),
            });
        }

        merged_permissions.push(AddonPermission {
            category: perm.category.clone(),
            functions: cloned_functions,
            purpose: perm.purpose.clone(),
        });
    }

    // Then, add detected permissions and merge with declared ones
    for detected_perm in detected_permissions {
        if let Some(existing) = merged_permissions
            .iter_mut()
            .find(|p| p.category == detected_perm.category)
        {
            for detected_func in &detected_perm.functions {
                if let Some(existing_func) = existing
                    .functions
                    .iter_mut()
                    .find(|f| f.name == detected_func.name)
                {
                    // Mark existing declared function as also detected
                    existing_func.is_detected = true;
                    existing_func.detected_at = detected_func.detected_at.clone();
                } else {
                    // Add new detected function (not declared)
                    existing.functions.push(detected_func.clone());
                }
            }
        } else {
            // Add as detected-only permission category
            merged_permissions.push(detected_perm);
        }
    }

    // Verify the merging results
    let ui_permission = merged_permissions
        .iter()
        .find(|p| p.category == "ui")
        .unwrap();

    // Check declared function that was also detected
    let sidebar_func = ui_permission
        .functions
        .iter()
        .find(|f| f.name == "sidebar.addItem")
        .unwrap();
    assert!(
        sidebar_func.is_declared,
        "sidebar.addItem should be marked as declared"
    );
    assert!(
        sidebar_func.is_detected,
        "sidebar.addItem should be marked as detected"
    );
    assert!(
        sidebar_func.detected_at.is_some(),
        "sidebar.addItem should have detected_at timestamp"
    );

    // Check declared function that was NOT detected
    let notification_func = ui_permission
        .functions
        .iter()
        .find(|f| f.name == "showNotification")
        .unwrap();
    assert!(
        notification_func.is_declared,
        "showNotification should be marked as declared"
    );
    assert!(
        !notification_func.is_detected,
        "showNotification should NOT be marked as detected"
    );
    assert!(
        notification_func.detected_at.is_none(),
        "showNotification should not have detected_at timestamp"
    );

    // Check undeclared function that was detected
    let router_func = ui_permission
        .functions
        .iter()
        .find(|f| f.name == "router.add");
    assert!(
        router_func.is_some(),
        "router.add should be present as detected function"
    );
    let router_func = router_func.unwrap();
    assert!(
        !router_func.is_declared,
        "router.add should NOT be marked as declared"
    );
    assert!(
        router_func.is_detected,
        "router.add should be marked as detected"
    );
    assert!(
        router_func.detected_at.is_some(),
        "router.add should have detected_at timestamp"
    );

    // Check onDisable function
    let ondisable_func = ui_permission
        .functions
        .iter()
        .find(|f| f.name == "onDisable");
    assert!(
        ondisable_func.is_some(),
        "onDisable should be present as detected function"
    );
    let ondisable_func = ondisable_func.unwrap();
    assert!(
        !ondisable_func.is_declared,
        "onDisable should NOT be marked as declared"
    );
    assert!(
        ondisable_func.is_detected,
        "onDisable should be marked as detected"
    );

    // Check portfolio permission
    let portfolio_permission = merged_permissions
        .iter()
        .find(|p| p.category == "portfolio")
        .unwrap();
    let holdings_func = portfolio_permission
        .functions
        .iter()
        .find(|f| f.name == "getHoldings")
        .unwrap();
    assert!(
        holdings_func.is_declared,
        "getHoldings should be marked as declared"
    );
    assert!(
        holdings_func.is_detected,
        "getHoldings should be marked as detected"
    );
    assert!(
        holdings_func.detected_at.is_some(),
        "getHoldings should have detected_at timestamp"
    );
}

#[test]
fn test_function_permission_serialization() {
    // Test that FunctionPermission serializes correctly to camelCase
    let permission = FunctionPermission {
        name: "testFunction".to_string(),
        is_declared: true,
        is_detected: true,
        detected_at: Some("2023-01-01T00:00:00Z".to_string()),
    };

    let serialized = serde_json::to_string(&permission).unwrap();
    println!("Serialized FunctionPermission: {}", serialized);

    // Should contain camelCase fields
    assert!(serialized.contains("isDeclared"));
    assert!(serialized.contains("isDetected"));
    assert!(serialized.contains("detectedAt"));
    assert!(!serialized.contains("is_declared"));
    assert!(!serialized.contains("is_detected"));
    assert!(!serialized.contains("detected_at"));

    // Test deserialization
    let deserialized: FunctionPermission = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.name, "testFunction");
    assert_eq!(deserialized.is_declared, true);
    assert_eq!(deserialized.is_detected, true);
    assert_eq!(
        deserialized.detected_at,
        Some("2023-01-01T00:00:00Z".to_string())
    );
}

#[test]
fn test_parse_manifest_json_metadata_service() {
    // Test the service function parse_manifest_json_metadata
    let manifest_json = r#"
    {
        "id": "test-addon",
        "name": "Test Addon",
        "version": "1.0.0",
        "description": "A test addon for testing",
        "author": "Test Author",
        "main": "addon.js",
        "permissions": [
            {
                "category": "ui",
                "purpose": "User interface access",
                "functions": ["showNotification", "openModal"]
            }
        ]
    }
    "#;

    let result = parse_manifest_json_metadata(manifest_json);
    assert!(result.is_ok(), "Failed to parse valid manifest JSON");

    let manifest = result.unwrap();
    assert_eq!(manifest.id, "test-addon");
    assert_eq!(manifest.name, "Test Addon");
    assert_eq!(manifest.version, "1.0.0");
    assert_eq!(
        manifest.description,
        Some("A test addon for testing".to_string())
    );
    assert_eq!(manifest.author, Some("Test Author".to_string()));
    assert_eq!(manifest.main, Some("addon.js".to_string()));

    // Check permissions were parsed correctly
    assert!(manifest.permissions.is_some());
    let permissions = manifest.permissions.unwrap();
    assert_eq!(permissions.len(), 1);
    assert_eq!(permissions[0].category, "ui");
    assert_eq!(permissions[0].purpose, "User interface access");
    assert_eq!(permissions[0].functions.len(), 2);
    assert_eq!(permissions[0].functions[0].name, "showNotification");
    assert_eq!(permissions[0].functions[0].is_declared, true);
    assert_eq!(permissions[0].functions[0].is_detected, false);
}

#[cfg(test)]
mod service_tests {
    use super::*;
    use std::env;

    #[test]
    fn test_ensure_addons_directory_service() {
        // Test the service function ensure_addons_directory
        let temp_dir = env::temp_dir().join("wealthfolio_test_addons");
        let app_data_path = temp_dir.to_str().unwrap();

        // Clean up any existing test directory
        if temp_dir.exists() {
            std::fs::remove_dir_all(&temp_dir).ok();
        }

        let result = ensure_addons_directory(app_data_path);
        assert!(result.is_ok(), "Failed to ensure addons directory");

        let addons_dir = result.unwrap();
        assert!(addons_dir.exists(), "Addons directory should exist");
        assert!(addons_dir.is_dir(), "Addons path should be a directory");
        assert_eq!(addons_dir.file_name().unwrap(), "addons");

        // Clean up
        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_get_addon_path_service() {
        // Test the service function get_addon_path
        let temp_dir = env::temp_dir().join("wealthfolio_test_addon_path");
        let app_data_path = temp_dir.to_str().unwrap();

        // Clean up any existing test directory
        if temp_dir.exists() {
            std::fs::remove_dir_all(&temp_dir).ok();
        }

        let result = get_addon_path(app_data_path, "test-addon");
        assert!(result.is_ok(), "Failed to get addon path");

        let addon_path = result.unwrap();
        assert_eq!(addon_path.file_name().unwrap(), "test-addon");

        // Verify the parent directory is the addons directory
        let parent = addon_path.parent().unwrap();
        assert_eq!(parent.file_name().unwrap(), "addons");

        // Clean up
        std::fs::remove_dir_all(&temp_dir).ok();
    }
}
