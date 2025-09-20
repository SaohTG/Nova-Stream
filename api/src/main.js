// api/src/main.js
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";

import authRouter, { ensureAuth } from "./modules/auth.js";
import userRouter from "./modules/user.js";
import xtreamRouter from "./modules/xtream.js";
import tmdbRouter from "./modules/tmdb.js";

const app = express();
app.set("trust proxy", 1);

// CORS simple et strict : une seule origine autorisée (depuis l'env)
const ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use(
  cors({
    origin: ORIGIN,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/user", ensureAuth, userRouter);
app.use("/xtream", ensureAuth, xtreamRouter);
app.use("/tmdb", ensureAuth, tmdbRouter);

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
    console.error("[API ERROR]", status, message, err.stack);
  }
  if (!res.headersSent) res.status(status).json({ error: message });
});

const port = Number(process.env.API_PORT || 4000);
app.listen(port, () => {
  console.log(`API on :${port}`);
});
