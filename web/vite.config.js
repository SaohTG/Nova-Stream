// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: { host: true, port: 5173, allowedHosts: ["lector.lorna.tv"] },
    preview: { host: true, port: 5173, allowedHosts: ["lector.lorna.tv"] },
    optimizeDeps: {
      include: ["shaka-player"],   // pré-bundle Shaka
      exclude: [],                 // ne pas exclure Shaka
    },
    define: {
      "import.meta.env.VITE_API_BASE": JSON.stringify(env.VITE_API_BASE),
    },
  };
});
