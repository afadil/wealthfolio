import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import externalGlobals from "rollup-plugin-external-globals";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Define process.env.NODE_ENV to remove development-only code
    "process.env.NODE_ENV": JSON.stringify("production"),
    // You can define other process.env variables if needed by your addon
    // 'process.env.SOME_VAR': JSON.stringify('some_value')
  },
  build: {
    lib: {
      entry: "src/addon.tsx",
      fileName: () => "addon.js",
      formats: ["es"],
    },
    rollupOptions: {
      // Externalize React, ReactDOM, SDK and UI library so the addon uses the host's version
      external: ["react", "react-dom", "@wealthvn/ui", "@wealthvn/ui/chart", "@wealthvn/addon-sdk"],
      plugins: [
        externalGlobals({
          react: "React",
          "react-dom": "ReactDOM",
          "@wealthvn/ui": "WealthVNUI",
          "@wealthvn/ui/chart": "WealthVNUIChart",
          "@wealthvn/addon-sdk": "WealthVNAddonSDK",
        }),
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@wealthvn/ui": "WealthVNUI",
          "@wealthvn/ui/chart": "WealthVNUIChart",
          "@wealthvn/addon-sdk": "WealthVNAddonSDK",
        },
      },
    },
    outDir: "dist",
    minify: false, // Keep readable for debugging
    sourcemap: true,
  },
});
