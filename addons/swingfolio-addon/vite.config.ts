import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import externalGlobals from "rollup-plugin-external-globals";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Define process.env.NODE_ENV to remove development-only code
    "process.env.NODE_ENV": JSON.stringify("production"),
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
