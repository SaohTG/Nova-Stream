// api/src/main.js
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";

import { initDatabase } from "./db/init.js";
import authRouter, { ensureAuth, ensureAuthOrRefresh } from "./modules/auth.js";
import userRouter from "./modules/user.js";
import xtreamRouter from "./modules/xtream.js";
import tmdbRouter from "./modules/tmdb.js";
import mediaRouter from "./modules/media.js";
import mylistRouter from "./modules/mylist.js";
import watchRouter from "./modules/watch.js";
import streamRouter from "./modules/stream.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

/* Sécurité HTTP */
app.use(
  helmet({
    hsts: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Désactiver complètement Permissions-Policy
    permissionsPolicy: false,
  })
);
app.use((_req, res, next) => {
  res.removeHeader("Permissions-Policy");
  next();
});

/* CORS + credentials */
const ORIGINS = String(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    return cb(ORIGINS.includes(origin) ? null : new Error("CORS blocked"), ORIGINS.includes(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Range", "If-Range"],
  exposedHeaders: ["Accept-Ranges", "Content-Range", "Content-Length", "Content-Type"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* Middlewares */
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(morgan("dev"));

/* Health */
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* Routes sans prefix */
app.use("/auth", authRouter);
app.use("/user", ensureAuth, userRouter);
app.use("/user/mylist", ensureAuth, mylistRouter);
app.use("/user/watch", ensureAuth, watchRouter);
app.use("/xtream", ensureAuthOrRefresh, xtreamRouter);
app.use("/tmdb", ensureAuth, tmdbRouter);
app.use("/media", ensureAuthOrRefresh, mediaRouter);
app.use("/stream", ensureAuthOrRefresh, streamRouter);

/* Routes prefix /api */
app.use("/api/auth", authRouter);
app.use("/api/user", ensureAuth, userRouter);
app.use("/api/user/mylist", ensureAuth, mylistRouter);
app.use("/api/user/watch", ensureAuth, watchRouter);
app.use("/api/xtream", ensureAuthOrRefresh, xtreamRouter);
app.use("/api/tmdb", ensureAuth, tmdbRouter);
app.use("/api/media", ensureAuthOrRefresh, mediaRouter);
app.use("/api/stream", ensureAuthOrRefresh, streamRouter);

/* Debug */
app.get("/debug/whoami", ensureAuthOrRefresh, (req, res) => res.json({ user: req.user }));

/* 404 */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "not_found", path: req.path });
});

/* Error handler */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "internal_error";
  if (process.env.NODE_ENV !== "production") {
    console.error("[API ERROR]", status, message, err.stack || err);
  }
  if (!res.headersSent) res.status(status).json({ error: message, detail: err.detail });
});

/* Boot */
const port = Number(process.env.API_PORT || 4000);

async function waitForDb(maxTries = 40, delayMs = 3000) {
  for (let i = 1; i <= maxTries; i++) {
    try {
      await initDatabase();
      console.log("[db] ready");
      return;
    } catch (e) {
      console.log(`[db] retry ${i}/${maxTries}: ${e?.message || e}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error("[db] still not ready after retries]");
}

/**
 * Nettoyage périodique des caches expirés
 */
async function startPeriodicCleanup() {
  const { cleanExpiredTrendingCache } = await import("./modules/tmdb.js");
  
  // Nettoyage initial
  await cleanExpiredTrendingCache();
  
  // Nettoyage quotidien à 3h du matin
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() < 5) {
      console.log("[CLEANUP] Lancement du nettoyage quotidien...");
      await cleanExpiredTrendingCache();
    }
  }, 5 * 60 * 1000); // Check toutes les 5 minutes
}

process.on("unhandledRejection", (e) => console.error("[UNHANDLED_REJECTION]", e));
process.on("uncaughtException", (e) => console.error("[UNCAUGHT_EXCEPTION]", e));

app.listen(port, () => console.log(`API on :${port}`));
waitForDb().then(() => {
  startPeriodicCleanup();
});
