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

## Roadmap

See [ROADMAP.md](./ROADMAP.md).

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

3. **Run in Development Mode**:

  Build and run the desktop application using Tauri:

  ```bash
  pnpm tauri dev
  ```

4. **Build for Production**:

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

### Development Tools

- **Vite**: Next-generation frontend tooling.
- **TypeScript**: Typed superset of JavaScript.
- **ESLint**: Pluggable linting utility for JavaScript and JSX.
- **Prettier**: Code formatter.

## Folder Structure

```
wealthfolio/
├── src/                 # Main source code for the React application
├── src-core/            # Core backend functionality
├── src-tauri/           # Tauri-specific code for desktop app functionality
├── public/              # Public assets
├── LICENSE              # License file
├── README.md            # Project documentation
├── ROADMAP.md           # Future plans and roadmap
├── components.json      # Component configuration
├── package.json         # Node.js dependencies and scripts
├── pnpm-lock.yaml       # Lock file for pnpm
├── postcss.config.js    # PostCSS configuration
├── tailwind.config.js   # Tailwind CSS configuration
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Vite build tool configuration
```

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
