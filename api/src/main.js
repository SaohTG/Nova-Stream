// api/src/main.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

// Routers (tous exportent `default`)
import authRouter from "./modules/auth.js";
import userRouter from "./modules/user.js";
import xtreamRouter from "./modules/xtream.js";
import tmdbRouter from "./modules/tmdb.js";

const app = express();

const PORT = Number(process.env.API_PORT || 4000);

// CORS: accepter une ou plusieurs origines (séparées par des virgules)
const ORIGIN_ENV = process.env.CORS_ORIGIN || "http://localhost:5173";
const ALLOWED_ORIGINS = ORIGIN_ENV.split(",").map(s => s.trim()).filter(Boolean);

// Utilitaires
app.set("trust proxy", 1);
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: (origin, cb) => {
      // autoriser requêtes server-to-server ou outils locaux
      if (!origin) return cb(null, true);
      // match exact sur la whitelist
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

// Healthcheck
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Routes
app.use(authRouter);   // /auth/...
app.use(userRouter);   // /user/...
app.use(xtreamRouter); // /xtream/...
app.use(tmdbRouter);   // /tmdb/...

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

// Error handler
app.use((err, _req, res, _next) => {
  const status = err?.status || 500;
  const message = err?.message || "Internal Server Error";
  if (process.env.NODE_ENV !== "production") {
    console.error("[API ERROR]", err);
  }
  res.status(status).json({ ok: false, error: message });
});

// Start
app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
});
