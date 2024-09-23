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

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/afadil/wealthfolio.git
   cd wealthfolio
   ```

2. **Install dependencies using pnpm**:

   ```bash
   pnpm install
   ```

### Running the Application

- **Development Mode**:

  Build and run the desktop application using Tauri:

  ```bash
  pnpm tauri dev
  ```

- **Build for Production**:

  Build the application for production:

  ```bash
  pnpm tauri build
  ```

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

-  **Tauri**: Framework for building tiny, secure, and fast desktop applications.

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

This project is licensed under the LGPL-3.0 license. See the `LICENSE` file for details.

## 🌟 Star History

## [![Star History Chart](https://api.star-history.com/svg?repos=afadil/wealthfolio&type=Timeline)](https://star-history.com/#afadil/wealthfolio&Date)

Enjoy managing your wealth with **Wealthfolio**! 🚀
