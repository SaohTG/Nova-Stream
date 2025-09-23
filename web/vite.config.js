// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: { host: true, port: 5173, allowedHosts: ["lector.lorna.tv"] },
    preview: { host: true, port: 5173, allowedHosts: ["lector.lorna.tv"] },

    // Shaka est importé dynamiquement, mais on le pré-bundle en dev pour plus de stabilité
    optimizeDeps: {
      include: ["shaka-player"],
    },

    define: {
      "import.meta.env.VITE_API_BASE": JSON.stringify(env.VITE_API_BASE || ""),
    },
  };
});
