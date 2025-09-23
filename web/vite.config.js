import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const hosts = ["app.lorna.tv","lector.lorna.tv","localhost","127.0.0.1","85.31.239.110"];

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: hosts,
      origin: "https://app.lorna.tv",
      hmr: { protocol: "wss", host: "app.lorna.tv", port: 443 },
    },
    preview: {
      host: true,
      port: 5173,              // pour rester aligné avec NPM
      strictPort: true,
      allowedHosts: true,      // ← règle le blocage ("Blocked request … preview.allowedHosts")
    },
    optimizeDeps: { include: ["shaka-player"] },
    define: { "import.meta.env.VITE_API_BASE": JSON.stringify(env.VITE_API_BASE || "") },
  };
});
