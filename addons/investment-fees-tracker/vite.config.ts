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
      // Externalize React and ReactDOM so the addon uses the host's version
      external: ["react", "react-dom", "react-i18next"],
      plugins: [
        externalGlobals({
          react: "React",
          "react-dom": "ReactDOM",
          "react-i18next": "ReactI18next",
        }),
      ],
      output: {
        globals: {
          react: "React", // Assumes React is available as window.React
          "react-dom": "ReactDOM", // Assumes ReactDOM is available as window.ReactDOM
          "react-i18next": "ReactI18next", // Set in apps/frontend main.tsx (same i18n context as the app)
        },
      },
    },
    outDir: "dist",
    minify: false, // Keep readable for debugging
    sourcemap: true,
  },
});
