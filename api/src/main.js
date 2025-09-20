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

const app = express();
app.set("trust proxy", 1);

// Multi-origines via CORS_ORIGIN="http://85.31.239.110:5173,http://localhost:5173"
const ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => (!origin || ORIGINS.includes(origin)) ? cb(null, true) : cb(null, false),
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/user", ensureAuth, userRouter);
app.use("/xtream", ensureAuth, xtreamRouter);
app.use("/tmdb", ensureAuth, tmdbRouter);

// Debug temporaire
app.get("/debug/whoami", ensureAuth, (req, res) => res.json({ user: req.user }));

// 404 JSON
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: "Not Found", path: req.path });
});

// Error JSON
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  if (process.env.NODE_ENV !== "production") {
    console.error("[API ERROR]", status, message, err.stack || err);
  }
  if (!res.headersSent) res.status(status).json({ error: message });
});

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
