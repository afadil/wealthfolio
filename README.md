<div align="center">
  <a href="https://github.com/afadil/wealthfolio">
    <img src="public/logo.svg" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Wealthfolio</h3>

  <p align="center">
    A Beautiful and Boring Desktop Investment Tracker
    <br />
    <br />
    <a href="https://wealthfolio.app">Website</a>
    ·
    <a href="https://discord.gg/WDMCY6aPWK">Discord</a>
    ·
    <a href="https://x.com/intent/follow?screen_name=WealthfolioApp">Twitter</a>
    ·
    <a href="https://github.com/afadil/wealthfolio/releases">Releases</a>
  </p>
</div>
<div align="center">

[<img src="./public/button-buy-me-a-coffee.png" width="180" alt="Buy me a coffee button"/>](https://www.buymeacoffee.com/afadil)

</div>

<div align="center">
<a href="https://news.ycombinator.com/item?id=41465735">
  <img
    alt="Featured on Hacker News"
    src="https://hackerbadge.now.sh/api?id=41465735"
    style="width: 250px; height: 55px;" width="250" height="55"
  />
</a>
  <a href="https://www.producthunt.com/posts/wealthfolio?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_souce=badge-wealthfolio" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=461640&amp;theme=light" alt="Wealthfolio - A boring, Local first, desktop Investment Tracking app | Product Hunt" class="h-[55px] w-[250px]" width="250" height="55"></a>

  <a href="https://trendshift.io/repositories/11701" target="_blank">
  <img src="https://trendshift.io/api/badge/repositories/11701" alt="afadil%2Fwealthfolio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

</div>

## Introduction

**Wealthfolio App** is a Beautiful and Boring Investment Tracker, with Local Data Storage. No
Subscriptions, No Cloud.

Visit the app website at [Wealthfolio App](https://wealthfolio.app/).

![Screenshot](public/screenshot.png)

### ✨ Key Features

- **📊 Portfolio Tracking** - Track your investments across multiple accounts and asset types
- **📈 Performance Analytics** - Detailed performance metrics and historical analysis
- **💰 Activity Management** - Import and manage all your trading activities
- **🎯 Goal Planning** - Set and track financial goals with allocation management
- **🔒 Local Data** - All data stored locally with no cloud dependencies
- **🧩 Extensible** - Powerful addon system for custom functionality
- **🌍 Multi-Currency** - Support for multiple currencies with exchange rate management
- **📱 Cross-Platform** - Available on Windows, macOS, and Linux

### 🧩 Addon System

Wealthfolio features a powerful addon system that allows developers to extend functionality:

- **🔌 Easy Development** - TypeScript SDK with full type safety and hot reload
- **🔒 Secure** - Comprehensive permission system with user consent
- **⚡ High Performance** - Optimized for speed with minimal overhead  
- **🎨 UI Integration** - Add custom pages, navigation items, and components
- **📡 Real-time Events** - Listen to portfolio updates, market sync, and user actions
- **🗄️ Full Data Access** - Access to accounts, holdings, activities, and market data
- **🔐 Secrets Management** - Secure storage for API keys and sensitive data

**Get started building addons:** [Addon Developer Guide](docs/addons/addon-developer-guide.md)

Documentation for all Activity types, including the required form fields, is available in [docs/activities/activity-types.md](docs/activities/activity-types.md).


## Roadmap

See [ROADMAP.md](./ROADMAP.md).

## 📖 Documentation

### Core Application
- **[Activity Types](docs/activities/activity-types.md)** - Complete guide to all supported activity types and their required fields
- **[Roadmap](ROADMAP.md)** - Future plans and development roadmap

### Addon Development
- **[Addon Documentation Hub](docs/addons/index.md)** - Main entry point for addon development
- **[Developer Guide](docs/addons/addon-developer-guide.md)** - Comprehensive guide from setup to advanced patterns
- **[API Reference](docs/addons/addon-api-reference.md)** - Complete API documentation with examples
- **[Permission System](docs/addons/addon-permissions.md)** - Security and permission system guide
- **[Examples & Tutorials](docs/addons/addon-examples.md)** - Practical examples and step-by-step tutorials

### Quick Links
- 🚀 **[Get Started with Addons](docs/addons/addon-developer-guide.md#quick-start)**
- 🔒 **[Security Best Practices](docs/addons/addon-permissions.md#security-best-practices)**
- 💡 **[Example Addons](addons/)** - Browse sample addons in the repository
- 🛠️ **[Development Tools](packages/addon-dev-tools/)** - CLI tools for addon development

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/)
- [Tauri](https://tauri.app/)

### Building from Source

1. **Clone the repository**:

   ```bash
   git clone https://github.com/afadil/wealthfolio.git
   cd wealthfolio
   ```

2. **Install dependencies using pnpm**:

   ```bash
   pnpm install
   ```

3. **Setup environment configuration**:

   Copy the environment template and configure it for your setup:

   ```bash
   cp .env.example .env
   ```

   Update the `.env` file with your database path and other configuration as needed:

   ```bash
   # Database location
   DATABASE_URL=../db/wealthfolio.db
   ```

4. **Run in Development Mode**:

  Build and run the desktop application using Tauri:

  ```bash
  pnpm tauri dev
  ```

5. **Build for Production**:

  Build the application for production:

  ```bash
  pnpm tauri build
  ```

### Development with DevContainer

For a consistent development environment across all platforms, you can use the provided DevContainer configuration. This method requires fewer manual setup steps and provides an isolated environment with all necessary dependencies.

#### Prerequisites

- [Docker](https://www.docker.com/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Remote - Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) VS Code extension

#### Features

- Pre-configured Tauri development environment
- X11 virtual display with VNC access (port 5900)
- Complete Rust development setup
- GPU support (via Docker's --gpus=all flag)
- Persistent data and build caches
- Essential VS Code extensions pre-installed

#### Starting Development with DevContainer

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone https://github.com/afadil/wealthfolio.git
   cd wealthfolio
   ```
   
2. **Open in VS Code**:
   - Open VS Code
   - Go to File > Open Folder
   - Select the wealthfolio directory

3. **Launch DevContainer**:
   - Press `F1` or `Ctrl+Shift+P`
   - Type "Remote-Containers: Reopen in Container"
   - Press Enter

4. **Wait for container build**:
   - VS Code will build and configure the development container
   - This may take a few minutes on first run

5. **Start Development**:
   - Once the container is ready, you can start development
   - All necessary tools and dependencies will be available

## Addon Development

Wealthfolio supports a powerful addon ecosystem that allows developers to extend functionality with custom features.

### Quick Start with Addons

1. **Create a new addon**:
   ```bash
   npx @wealthfolio/addon-dev-tools create my-addon
   cd my-addon
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev:server
   ```

3. **Start Wealthfolio in development mode** (in another terminal):
   ```bash
   pnpm tauri dev
   ```

Your addon will be automatically discovered and loaded with hot reload support!

### Addon Features

- **🎨 UI Integration**: Add custom pages and navigation items
- **📊 Data Access**: Full access to portfolio, accounts, and market data
- **📡 Real-time Events**: React to portfolio updates and user actions
- **🔐 Secure Storage**: Store API keys and sensitive data securely
- **⚡ Hot Reload**: Seamless development experience
- **🔒 Permission System**: Transparent security with user consent

### Example Addons

Check out the [addons/](addons/) directory for sample addons including:
- **Goal Progress Tracker**: Visual goal tracking with calendar like interface
- More examples in the [documentation](docs/addons/addon-examples.md)

### Resources

- **[Complete Developer Guide](docs/addons/addon-developer-guide.md)** - Everything you need to know
- **[API Reference](docs/addons/addon-api-reference.md)** - Full API documentation
- **[Permission System](docs/addons/addon-permissions.md)** - Security and permissions guide
- **[Examples & Tutorials](docs/addons/addon-examples.md)** - Step-by-step tutorials

## Technologies Used

### Frontend

- **React**: JavaScript library for building user interfaces.
- **React Router**: Declarative routing for React.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Radix UI/Shadcn**: Accessible UI components.
- **Recharts**: Charting library built with React.
- **React Query**: Data-fetching library for React.
- **Zod**: TypeScript-first schema declaration and validation library.

### Backend

- **Tauri**: Framework for building tiny, secure, and fast desktop applications.
- **Rust**: Systems programming language for core backend functionality.
- **SQLite**: Embedded database for local data storage.
- **Diesel**: Safe, extensible ORM and query builder for Rust.

### Addon System

- **@wealthfolio/addon-sdk**: TypeScript SDK for addon development with full type safety.
- **@wealthfolio/addon-dev-tools**: CLI tools and development server for hot reload.
- **@wealthfolio/ui**: Shared UI component library for consistent styling.

### Development Tools

- **Vite**: Next-generation frontend tooling.
- **TypeScript**: Typed superset of JavaScript.
- **ESLint**: Pluggable linting utility for JavaScript and JSX.
- **Prettier**: Code formatter.
- **pnpm**: Fast, disk space efficient package manager.
- **Turborepo**: High-performance build system for JavaScript and TypeScript codebases.

## Folder Structure

```
wealthfolio/
├── src/                         # Main source code for the React application
│   ├── addons/                  # Addon system core functionality
│   ├── components/              # React components
│   ├── pages/                   # Application pages and routes
│   ├── hooks/                   # Custom React hooks
│   └── lib/                     # Utility libraries and helpers
├── src-core/                    # Core backend functionality (Rust)
├── src-tauri/                   # Tauri-specific code for desktop app functionality
├── addons/                      # Example and sample addons
│   └── goal-progress-tracker/   # Goal Progress tracker addon example
├── packages/                    # Shared packages and tools
│   ├── addon-sdk/               # Addon SDK for developers
│   ├── addon-dev-tools/         # Development tools and CLI
│   └── ui/                      # Shared UI components library
├── docs/                        # Documentation
│   ├── addons/                  # Addon development documentation
│   └── activities/              # Activity types documentation
├── public/                      # Public assets
├── db/                          # Database files and migrations
├── LICENSE                      # License file
├── README.md                    # Project documentation
├── ROADMAP.md                   # Future plans and roadmap
├── components.json              # Component configuration
├── package.json                 # Node.js dependencies and scripts
├── pnpm-lock.yaml               # Lock file for pnpm
├── postcss.config.js            # PostCSS configuration
├── tailwind.config.js           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── vite.config.ts               # Vite build tool configuration
```

### Security & Data Storage

#### Local Data Storage
All your financial data is stored locally using SQLite database with no cloud dependencies:
- Portfolio holdings and performance data
- Trading activities and transaction history
- Account information and settings
- Goals and contribution limits

#### API Keys & Secrets
API credentials are securely stored using the operating system keyring through the `keyring` crate:
- **Core App**: Use `set_secret` and `get_secret` commands for external services
- **Addons**: Use the Secrets API (`ctx.api.secrets`) for addon-specific sensitive data
- **No Disk Storage**: Keys never written to disk or configuration files

#### Permission System
Addons operate under a comprehensive permission system:
- Automatic code analysis during installation
- User consent required for data access
- Risk-based security warnings
- Transparent permission declarations

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add some feature'`).
5. Push to the branch (`git push origin feature-branch`).
6. Open a pull request.

## License

This project is licensed under the AGPL-3.0 license. See the `LICENSE` file for details.

## 🌟 Star History

## [![Star History Chart](https://api.star-history.com/svg?repos=afadil/wealthfolio&type=Timeline)](https://star-history.com/#afadil/wealthfolio&Date)

Enjoy managing your wealth with **Wealthfolio**! 🚀
