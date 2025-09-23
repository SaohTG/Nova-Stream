import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: true,                 // ← autorise tous les hosts en dev
      origin: "https://app.lorna.tv",
      hmr: { protocol: "wss", host: "app.lorna.tv", port: 443 },
    },
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: true,                 // ← clé qui lève le blocage en preview
    },
    optimizeDeps: { include: ["shaka-player"] },
    define: { "import.meta.env.VITE_API_BASE": JSON.stringify(env.VITE_API_BASE || "") },
  };
});
