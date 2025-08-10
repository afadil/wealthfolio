# Wealthfolio Addon Documentation

Welcome to the comprehensive documentation for developing Wealthfolio addons! This documentation will guide you from your first addon to advanced development patterns.

## 🚀 Getting Started

**New to addon development?** Start here:

1. **[Addon Developer Guide](addon-developer-guide.md)** - Complete guide from setup to advanced patterns
2. **[Development Setup](addon-development.md)** - Environment setup and hot reload
3. **[Examples & Tutorials](addon-examples.md)** - Practical examples and step-by-step tutorials

## 📚 Core Documentation

### Development Guides
- **[Addon Developer Guide](addon-developer-guide.md)** - Main comprehensive guide
- **[API Reference](addon-api-reference.md)** - Complete API documentation
- **[Addon Permissions](addon-permissions.md)** - Security and permission system guide
- **[Examples & Tutorials](addon-examples.md)** - Practical examples

## 🎯 Quick Navigation

### By Use Case

**🏗️ Building Your First Addon**
- [Quick Start Guide](addon-developer-guide.md#quick-start)
- [Hello World Example](addon-examples.md#example-1-simple-hello-world-addon)
- [Development Environment](addon-developer-guide.md#development-environment)

**📊 Data & Analytics Addons**
- [Portfolio Analytics](addon-examples.md#example-6-performance-analytics-dashboard)
- [Data Visualization](addon-examples.md#example-3-portfolio-pie-chart)
- [API Reference - Portfolio API](addon-api-reference.md#-portfolio-api)

**📥 Import & Export Tools**
- [CSV Activity Importer](addon-examples.md#example-4-csv-activity-importer)
- [API Reference - Activities API](addon-api-reference.md#-activities-api)
- [Activity Types Reference](activity-types.md)

**📈 Market Data Integration**
- [Custom Market Data Provider](addon-examples.md#example-5-custom-market-data-provider)
- [API Reference - Market API](addon-api-reference.md#-market-data-api)
- [Secrets API for API Keys](addon-api-reference.md#-secrets-api)

**🎯 Goal & Planning Tools**
- [API Reference - Goals API](addon-api-reference.md#-goals-api)
- [API Reference - Contribution Limits API](addon-api-reference.md#️-contribution-limits-api)

### By API Domain

**🏦 Accounts Management**
- [Accounts API Reference](addon-api-reference.md#-accounts-api)
- [Account Summary Example](addon-examples.md#example-2-account-summary-widget)

**📊 Portfolio Operations**
- [Portfolio API Reference](addon-api-reference.md#-portfolio-api)
- [Performance API Reference](addon-api-reference.md#-performance-api)
- [Portfolio Analytics Example](addon-examples.md#example-6-performance-analytics-dashboard)

**📝 Activity Management**
- [Activities API Reference](addon-api-reference.md#-activities-api)
- [Activity Types Reference](activity-types.md)
- [Activity Importer Example](addon-examples.md#example-4-csv-activity-importer)

**📈 Market Data**
- [Market API Reference](addon-api-reference.md#-market-data-api)
- [Quotes API Reference](addon-api-reference.md#-quotes-api)
- [Market Data Provider Example](addon-examples.md#example-5-custom-market-data-provider)

**🎧 Events & Real-time Updates**
- [Events API Reference](addon-api-reference.md#event-system)
- [Event Handling Examples](addon-developer-guide.md#event-system)

## 🛠️ Development Tools

### CLI Commands

**Initial Setup:**
```bash
# Create new addon
npx @wealthfolio/addon-dev-tools create my-addon

# Navigate to addon directory
cd my-addon

# Install dependencies
npm install
```

**Development (using npm scripts - recommended):**
```bash
# Start development server
npm run dev:server

# Build for production
npm run build

# Package for distribution
npm run bundle

# Type checking
npm run lint

# Clean build artifacts
npm run clean
```

**Alternative (using CLI directly):**
```bash
# Start development server
wealthfolio dev

# Build addon
wealthfolio build

# Package addon
wealthfolio package

# Test setup
wealthfolio test
```

### Debugging Tools
```javascript
// Browser console debugging
__ADDON_DEV__.getStatus()        // Check development status
discoverAddons()                 // Manual addon discovery
reloadAddons()                   // Reload all addons
```

### Project Structure
```
my-addon/
├── src/
│   └── addon.tsx               # Main addon entry point
├── dist/                       # Built files (generated)
├── manifest.json               # Addon metadata & permissions
├── package.json                # NPM configuration
├── vite.config.ts             # Build configuration
├── tsconfig.json              # TypeScript configuration
└── README.md                  # Addon documentation
```

## 📖 Learning Path

### Beginner
1. Read the [Quick Start](addon-developer-guide.md#quick-start) section
2. Try the [Hello World Example](addon-examples.md#example-1-simple-hello-world-addon)  
3. Set up your [development environment](addon-developer-guide.md#development-environment)
4. Build the [Account Summary Widget](addon-examples.md#example-2-account-summary-widget)

### Intermediate
1. Learn about [Addon Permissions](addon-permissions.md) for secure development
2. Explore [Activity Types](activity-types.md) for trading operations
3. Build a [Portfolio Pie Chart](addon-examples.md#example-3-portfolio-pie-chart)
4. Create an [Activity Importer](addon-examples.md#example-4-csv-activity-importer)

### Advanced
1. Study the [Advanced Topics](addon-developer-guide.md#advanced-topics) section
2. Build a [Market Data Provider](addon-examples.md#example-5-custom-market-data-provider)
3. Create a [Performance Analytics Dashboard](addon-examples.md#example-6-performance-analytics-dashboard)
4. Explore [Advanced Patterns](addon-developer-guide.md#advanced-topics)

## 🔧 Troubleshooting

### Common Issues
- **Dev Server Not Starting**: [Troubleshooting Guide](addon-developer-guide.md#troubleshooting)
- **Hot Reload Not Working**: [Debug Commands](addon-development.md#debug-commands)
- **API Calls Failing**: [Error Handling](addon-api-reference.md#error-handling)
- **TypeScript Errors**: [Type System Guide](ADDON_TYPE_STRATEGY.md)

### Debug Resources
- [Development Commands](addon-development.md#debug-commands)
- [Manual Registration](addon-development.md#manual-registration)
- [Error Handling Guide](addon-api-reference.md#error-handling)

## 🎨 Best Practices

### Code Quality
- ✅ Use TypeScript for type safety
- ✅ Handle errors gracefully
- ✅ Clean up resources in disable function
- ✅ Follow React best practices

### Security & Permissions
- ✅ Use Secrets API for sensitive data (API keys, tokens)
- ✅ Declare only required permissions in manifest
- ✅ Provide clear permission purposes for user trust
- ✅ Handle permission errors gracefully
- ✅ Validate user inputs before API calls
- ✅ Review permission dialog before distribution

### Performance
- ✅ Use React.memo for expensive components
- ✅ Implement proper loading states
- ✅ Batch API calls when possible
- ✅ Listen for relevant events only

## 🚀 API Highlights

### Subdomain Organization
The API is organized into logical domains for better discoverability:

```typescript
ctx.api = {
  accounts: { /* Account management */ },
  portfolio: { /* Portfolio & holdings */ },
  activities: { /* Trading activities */ },
  market: { /* Market data */ },
  performance: { /* Performance metrics */ },
  goals: { /* Financial goals */ },
  settings: { /* App settings */ },
  events: { /* Real-time events */ },
  secrets: { /* Secure storage */ },
  // ... and more
}
```

### Key Features
- 🔒 **Secure**: Scoped secrets storage per addon
- 📡 **Real-time**: Event system for live updates
- 🎯 **Type-safe**: Full TypeScript support
- 🔧 **Hot Reload**: Seamless development experience
- 📊 **Comprehensive**: 60+ API functions across 13 domains

## 🤝 Contributing

We welcome contributions to improve the addon ecosystem:

- **Bug Reports**: Help identify and fix issues
- **Feature Requests**: Suggest new API features
- **Documentation**: Improve guides and examples
- **Example Addons**: Share useful addon examples

## 📄 License

This documentation is part of the Wealthfolio project. See the main project for license information.

---

**Ready to build your first addon?** Start with the [Addon Developer Guide](addon-developer-guide.md)! 🚀
