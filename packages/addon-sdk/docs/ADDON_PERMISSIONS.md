# Enhanced Addon Management System

This document describes the improved addon management system with comprehensive permission tracking.

## Features Implemented

### 1. Permission Analysis System (`src/addon/permissions.ts`)

#### Permission Categories (defined in `packages/addon-sdk`)
- **Portfolio Data**: Holdings, performance metrics, valuations (Medium Risk)
- **Transaction History**: Activity records, imports, modifications (High Risk)
- **Account Management**: Account info, settings, management (High Risk)
- **Market Data**: Quotes, prices, financial data (Low Risk)
- **Financial Planning**: Goals, contribution limits, planning tools (Medium Risk)
- **Currency**: Exchange rates and conversion data (Low Risk)
- **Application Settings**: App configuration, backups (High Risk)
- **File Operations**: File dialogs, system operations (Medium Risk)
- **Event Listeners**: Application events, notifications (Low Risk)
- **User Interface**: Navigation modifications, UI components (Low Risk)

#### Code Analysis
- Automatically detects API function usage in addon code
- Categorizes permissions by risk level
- Validates manifest declarations against actual usage
- Provides detailed permission descriptions

### 2. Permission Dialog (`src/components/addon-permission-dialog.tsx`)

#### Pre-Installation Review
- Shows addon metadata (name, version, author)
- Displays risk assessment with color-coded indicators
- Lists detected permission categories with descriptions
- Shows declared data access from manifest
- Provides security warnings for high-risk addons
- Allows users to approve or deny installation

#### Risk Level Indicators
- **Low Risk**: Green badge, minimal data access
- **Medium Risk**: Yellow badge, moderate data access
- **High Risk**: Red badge, extensive sensitive data access

### 3. Permission View Component (`src/components/addon-permissions-view.tsx`)

#### Permission Display
- Collapsible view showing addon permissions
- Displays declared data access with risk levels
- Shows permission categories and descriptions
- Clean, focused interface without runtime monitoring

### 4. Enhanced Addon Settings (`src/pages/settings/addons/addon-settings.tsx`)

#### Improved Installation Flow
1. User selects addon ZIP file
2. System extracts and analyzes addon code
3. Permission analysis detects API usage
4. Permission dialog shows security review
5. User approves/denies installation
6. Installation proceeds with monitoring enabled

#### Enhanced Addon Display
- Each addon card shows permission view on hover
- Security indicators and risk assessment
- Detailed permission breakdown
- Clean, focused permission management

### 5. Enhanced Manifest Support (types in `packages/addon-sdk`)

#### Extended Manifest Schema
```json
{
  "id": "portfolio-tracker",
  "name": "Portfolio Tracker",
  "version": "1.0.0",
  "permissions": ["sidebar.add", "router.add"],
  "dataAccess": [
    {
      "category": "portfolio",
      "functions": ["holdings", "getHolding"],
      "purpose": "Display portfolio analytics dashboard"
    },
    {
      "category": "market-data",
      "functions": ["searchTicker", "getQuoteHistory"],
      "purpose": "Show price charts and ticker search"
    }
  ]
}
```

#### Validation Features
- Compares declared permissions with detected usage
- Warns about missing or extra permissions
- Validates manifest against actual code behavior
- Provides permission mismatch reporting

## Security Benefits

### 1. User Awareness
- Clear visibility into addon data access
- Risk-based security warnings
- Detailed permission explanations
- Pre-installation security review

### 2. Permission Validation
- Automated code analysis
- Manifest verification
- Permission mismatch detection
- Security compliance checking

### 3. Developer Guidelines
- Clear permission category definitions
- Standard manifest schema
- Best practices for data access
- Security-focused development workflow

## Usage Examples

### For Users
1. **Installing Addons**: Users see a permission dialog before installation showing exactly what data the addon will access
2. **Managing Addons**: Each addon shows its declared permissions and risk assessment
3. **Security Review**: Users can see what permission categories are being used

### For Addon Developers
1. **Manifest Declaration**: Developers declare their data usage in the manifest
2. **Permission Categories**: Use predefined categories for consistency
3. **Validation**: System validates actual usage against declarations
4. **SDK Integration**: All types and constants available in `@wealthfolio/addon-sdk`

## Architecture Benefits

### 1. Clean Separation
- Permission types and constants in addon-sdk package
- Analysis logic in main application
- Clear separation of concerns

### 2. No Runtime Overhead
- No API call tracking or monitoring
- Focus on permission declaration and validation
- Lightweight, efficient implementation

## Future Enhancements

### Potential Additions
1. **Permission Scopes**: Limit addon access to specific accounts or data ranges
2. **User Consent**: Per-function consent for sensitive operations
3. **Sandbox Mode**: Run addons in restricted environments
4. **Permission Revocation**: Allow users to revoke specific permissions
5. **Security Ratings**: Community-driven security ratings for addons
6. **Runtime Monitoring**: Optional API call tracking for debugging (if needed)

This system provides a clean, efficient foundation for secure addon management with clear separation of concerns and no runtime overhead.
