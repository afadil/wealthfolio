/**
 * Mock addon store for testing addon update functionality
 * In production, this would be replaced with actual API calls to the addon store
 */

import type { AddonStoreListing } from '@wealthfolio/addon-sdk';

// Mock store data - replace with actual API endpoints
const MOCK_STORE_DATA: Record<string, AddonStoreListing> = {
  'hello-world-addon': {
    metadata: {
      id: 'hello-world-addon',
      name: 'Hello World Addon',
      version: '1.2.0', // Newer version than what's typically installed (1.1.0)
      description: 'An improved Hello World addon with new features and bug fixes.',
      author: 'Wealthfolio Team',
      sdkVersion: '1.1.0',
      main: 'dist/addon.js',
      enabled: true,
      keywords: ['demo', 'hello-world', 'sample'],
      license: 'MIT',
      minWealthfolioVersion: '1.0.0',
    },
    downloadUrl: 'https://github.com/wealthfolio/hello-world-addon/releases/download/v1.2.0/hello-world-addon-v1.2.0.zip',
    downloads: 1250,
    rating: 4.8,
    reviewCount: 23,
    status: 'active' as const,
    lastUpdated: '2025-01-20T10:30:00Z',
    images: [],
    tags: ['demo', 'tutorial', 'beginner'],
    releaseNotes: `# Hello World Addon v1.2.0

## What's New

### ✨ New Features
- Added interactive welcome animation
- Improved responsive design for mobile devices
- New customization options for greeting messages

### 🐛 Bug Fixes
- Fixed rendering issue on dark mode
- Improved error handling for invalid configurations
- Fixed memory leak in component cleanup

### 🔧 Improvements
- Updated dependencies to latest versions
- Improved performance by 25%
- Better accessibility support

### 🔒 Security
- Enhanced input validation
- Updated security dependencies

## Breaking Changes
None in this release.

## Installation
This update is compatible with all existing configurations.`,
    changelogUrl: 'https://github.com/wealthfolio/hello-world-addon/blob/main/CHANGELOG.md',
  },
  
  'portfolio-tracker': {
    metadata: {
      id: 'portfolio-tracker',
      name: 'Advanced Portfolio Tracker',
      version: '2.1.0',
      description: 'Enhanced portfolio tracking with advanced analytics and reporting.',
      author: 'Portfolio Analytics Inc',
      sdkVersion: '1.1.0',
      main: 'dist/addon.js',
      enabled: true,
      keywords: ['portfolio', 'analytics', 'tracking'],
      license: 'MIT',
      minWealthfolioVersion: '1.0.0',
    },
    downloadUrl: 'https://releases.portfolio-tracker.com/v2.1.0/portfolio-tracker-v2.1.0.zip',
    downloads: 5680,
    rating: 4.9,
    reviewCount: 89,
    status: 'active' as const,
    lastUpdated: '2025-01-15T14:20:00Z',
    images: [],
    tags: ['portfolio', 'analytics', 'performance', 'tracking'],
    releaseNotes: `# Advanced Portfolio Tracker v2.1.0

## 🚨 CRITICAL SECURITY UPDATE

This release includes important security fixes. Please update immediately.

### 🔒 Security Fixes
- Fixed potential XSS vulnerability in chart rendering
- Updated encryption for sensitive portfolio data
- Improved API key handling and storage

### ✨ New Features
- Real-time portfolio value tracking
- Advanced risk analysis tools
- Export portfolio data to multiple formats

### 🐛 Bug Fixes
- Fixed calculation errors in performance metrics
- Improved data synchronization reliability
- Fixed timezone issues in historical data

## Breaking Changes
- API endpoint structure has changed (migration guide included)
- Configuration format updated (auto-migration provided)

Please review the migration guide before updating.`,
    changelogUrl: 'https://portfolio-tracker.com/changelog',
  },
};

/**
 * Simulate fetching addon store information
 * Replace this with actual API calls in production
 */
export async function fetchMockAddonStoreInfo(addonId: string): Promise<AddonStoreListing> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
  
  const storeData = MOCK_STORE_DATA[addonId];
  
  if (!storeData) {
    throw new Error(`Addon '${addonId}' not found in store`);
  }
  
  return storeData;
}

/**
 * Simulate downloading addon package
 * Replace this with actual download logic in production
 */
export async function downloadMockAddonPackage(downloadUrl: string): Promise<Uint8Array> {
  // Simulate download delay
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
  
  // In a real implementation, this would fetch the actual ZIP file
  // For now, we'll simulate by returning an empty array
  // The actual implementation would use fetch() or similar to download the file
  
  console.log(`Mock download from: ${downloadUrl}`);
  
  // Return empty array for mock - in real implementation, return the ZIP data
  return new Uint8Array(0);
}

/**
 * Check if mock store has data for the given addon
 */
export function hasMockStoreData(addonId: string): boolean {
  return addonId in MOCK_STORE_DATA;
}

/**
 * Get all available mock addon IDs
 */
export function getMockAddonIds(): string[] {
  return Object.keys(MOCK_STORE_DATA);
}
