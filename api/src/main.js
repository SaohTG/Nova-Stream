// api/src/main.js
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";

import { initDatabase } from "./db/init.js";
import authRouter, { ensureAuth } from "./modules/auth.js";
import userRouter from "./modules/user.js";
import xtreamRouter from "./modules/xtream.js";
import tmdbRouter from "./modules/tmdb.js";
import mediaRouter from "./modules/media.js";
import mylistRouter from "./modules/mylist.js";
import watchRouter from "./modules/watch.js";
import streamRouter from "./modules/stream.js";
import { requireAccess } from "./middleware/resolveMe.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

/* CORS */
const ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => (!origin || ORIGINS.includes(origin) ? cb(null, true) : cb(null, false)),
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
app.get("/api/health", (_req, res) => res.json({ ok: true })); // support prefix

/* Routes sans prefix */
app.use("/auth", authRouter);
app.use("/user", ensureAuth, userRouter);
app.use("/user/mylist", ensureAuth, mylistRouter);
app.use("/user/watch", ensureAuth, watchRouter);
app.use("/xtream", ensureAuth, xtreamRouter);
app.use("/tmdb", ensureAuth, tmdbRouter);
// Utiliser requireAccess pour les flux pour gérer refresh→access automatiquement
app.use("/media", requireAccess, mediaRouter);
app.use("/stream", requireAccess, streamRouter);

/* Routes avec prefix /api */
app.use("/api/auth", authRouter);
app.use("/api/user", ensureAuth, userRouter);
app.use("/api/user/mylist", ensureAuth, mylistRouter);
app.use("/api/user/watch", ensureAuth, watchRouter);
app.use("/api/xtream", ensureAuth, xtreamRouter);
app.use("/api/tmdb", ensureAuth, tmdbRouter);
app.use("/api/media", requireAccess, mediaRouter);
app.use("/api/stream", requireAccess, streamRouter);

/* Debug */
app.get("/debug/whoami", ensureAuth, (req, res) => res.json({ user: req.user }));

/* 404 */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "Not Found", path: req.path });
});

/* Error handler */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  if (process.env.NODE_ENV !== "production") {
    console.error("[API ERROR]", status, message, err.stack || err);
  }
  if (!res.headersSent) res.status(status).json({ message, detail: err.detail, error: "unauthorized" });
});

/* Boot */
const port = Number(process.env.API_PORT || 4000);
process.on("unhandledRejection", (e) => console.error("[UNHANDLED_REJECTION]", e));
process.on("uncaughtException", (e) => console.error("[UNCAUGHT_EXCEPTION]", e));

async function startServer() {
  try {
    await initDatabase();
    app.listen(port, () => console.log(`API on :${port}`));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}
startServer();
