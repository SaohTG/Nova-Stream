// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: { host: true, port: 5173, allowedHosts: ["lector.lorna.tv"] },
    preview: { host: true, port: 5173, allowedHosts: ["lector.lorna.tv"] },

    // Ne prébundle pas Shaka en dev
    optimizeDeps: {
      exclude: ["shaka-player", "shaka-player/dist/shaka-player.compiled.js"],
    },
    // Marque Shaka comme externe au build (chargé via <script> CDN)
    build: {
      rollupOptions: {
        external: ["shaka-player", "shaka-player/dist/shaka-player.compiled.js"],
      },
    },

    define: {
      "import.meta.env.VITE_API_BASE": JSON.stringify(env.VITE_API_BASE),
    },
  };
});
