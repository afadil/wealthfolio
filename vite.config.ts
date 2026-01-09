import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;
const apiTarget =
  process.env.VITE_API_TARGET || process.env.WF_API_TARGET || "http://127.0.0.1:8080";
const enableProxy = process.env.WF_ENABLE_VITE_PROXY === "true";
const serverProxy = enableProxy
  ? {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/openapi.json": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/docs": {
        target: apiTarget,
        changeOrigin: true,
      },
    }
  : undefined;

// Determine build target: "tauri" for desktop, "web" for browser
// Default to "tauri" for local development - use BUILD_TARGET=web for web builds
// TAURI_DEV_HOST is only set for mobile/network dev, so we can't rely on it
const buildTarget = process.env.BUILD_TARGET || "tauri";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      // Icon libraries (heavy barrel exports)
      "lucide-react",
      // Charting
      "recharts",
      // TanStack
      "@tanstack/react-table",
      "@tanstack/react-virtual",
      "@tanstack/react-query",
      // Animation
      "motion",
      // Forms
      "react-hook-form",
      "@hookform/resolvers",
      // Utilities
      "date-fns",
      "zod",
      "clsx",
      "tailwind-merge",
      "lodash",
      // Radix UI components
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-switch",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-label",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-progress",
      "@radix-ui/react-toast",
      "@radix-ui/react-avatar",
      // Other UI
      "react-day-picker",
      "cmdk",
      "sonner",
      "react-aria-components",
      "class-variance-authority",
      "embla-carousel-react",
      "input-otp",
      "react-dropzone",
      "papaparse",
      "qrcode.react",
      // Supabase
      "@supabase/supabase-js",
    ],
  },
  define: {
    __BUILD_TARGET__: JSON.stringify(buildTarget),
  },
  resolve: {
    alias: {
      "@wealthfolio/addon-sdk": path.resolve(__dirname, "packages/addon-sdk/src"),
      "@wealthfolio/ui": path.resolve(__dirname, "packages/ui/src"),
      // Conditional adapter alias based on build target
      "@/adapters": path.resolve(
        __dirname,
        buildTarget === "tauri" ? "./src-front/adapters/tauri" : "./src-front/adapters/web",
      ),
      "@": path.resolve(__dirname, "./src-front"),
    },
    extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host ? "0.0.0.0" : false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    proxy: serverProxy,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  // 3. to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.app/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ["VITE_", "TAURI_", "CONNECT_"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    //target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src-front/test/setup.ts",
    include: ["src-front/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
} as unknown as import("vitest/config").UserConfigExport);
