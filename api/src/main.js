// api/src/main.js
import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import authRouter, { ensureAuth } from "./modules/auth.js";
import xtreamRouter from "./modules/xtream.js";
import tmdbRouter from "./modules/tmdb.js";

const app = express();

/* ---------- base middlewares ---------- */
app.set("trust proxy", 1);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan("tiny"));

/* ---------- CORS (cookies + credentials) ---------- */
const ORIGINS = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl / server-side
    if (ORIGINS.length === 0) return cb(null, true);
    if (ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS_NOT_ALLOWED"), false);
  },
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ---------- health ---------- */
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* ---------- routes ---------- */
app.use("/api/auth", authRouter);
app.use("/api/xtream", ensureAuth, xtreamRouter);
app.use("/api/tmdb", ensureAuth, tmdbRouter);

/* ---------- 404 ---------- */
app.use((req, res) => {
  res.status(404).json({ message: "Not Found", path: req.originalUrl });
});

/* ---------- error handler ---------- */
app.use((err, req, res, _next) => {
  const status = Number(err.status || err.code || 500);
  const payload = {
    message: err.message || "Internal Error",
  };
  if (process.env.NODE_ENV !== "production") {
    payload.stack = err.stack;
    payload.details = err.body || err.data;
  }
  // log minimal
  console.error("[ERR]", status, req.method, req.originalUrl, "-", err.message);
  res.status(status).json(payload);
});

/* ---------- listen ---------- */
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`[API] listening on http://${HOST}:${PORT}`);
});

export default app;
