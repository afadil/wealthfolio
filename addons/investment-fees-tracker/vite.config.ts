import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import externalGlobals from "rollup-plugin-external-globals";

export default defineConfig({
  plugins: [react()],
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
      external: ["react", "react-dom"],
      plugins: [
        externalGlobals({
          react: "React",
          "react-dom": "ReactDOM",
        }),
      ],
      output: {
        globals: {
          react: "React", // Assumes React is available as window.React
          "react-dom": "ReactDOM", // Assumes ReactDOM is available as window.ReactDOM
        },
      },
    },
    outDir: "dist",
    minify: false, // Keep readable for debugging
    sourcemap: true,
  },
});
