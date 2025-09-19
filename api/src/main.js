// api/src/main.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// ⚠️ morgan optionnel (fallback no-op si non installé)
let morgan = () => (_req, _res, next) => next();
try {
  const mod = await import("morgan");
  morgan = mod.default || mod;
} catch {
  console.warn("[init] morgan non installé — logging HTTP désactivé");
}

// Routes modules
import authRouter from "./modules/auth.js";
import userRouter from "./modules/user.js";
import xtreamRouter from "./modules/xtream.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// Logs HTTP (no-op si morgan absent)
app.use(morgan("dev"));

// Cookies (ns_access, ns_refresh)
app.use(cookieParser());

// CORS (avec cookies)
const ORIGIN = process.env.CORS_ORIGIN || "http://85.31.239.110:5173";
app.use(
  cors({
    origin: ORIGIN,
    credentials: true,
  })
);

// JSON body
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Health
app.get("/", (_req, res) => res.json({ ok: true, service: "nova-stream-api" }));
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Routes
app.use(authRouter);
app.use(userRouter);
app.use(xtreamRouter);

// 404 + Error handler
app.use((req, res) => res.status(404).json({ ok: false, error: "Not Found", path: req.path }));
app.use((err, _req, res, _next) => {
  const status = err?.status || 500;
  const message = err?.message || "Internal Server Error";
  if (status >= 500) console.error("[API error]", message, err?.stack || "");
  res.status(status).json({ ok: false, error: message });
});

// Start
const port = Number(process.env.API_PORT || 4000);
app.listen(port, () => console.log(`API on :${port}`));

// Safety
process.on("unhandledRejection", (r) => console.error("UnhandledRejection:", r));
process.on("uncaughtException", (e) => console.error("UncaughtException:", e));
