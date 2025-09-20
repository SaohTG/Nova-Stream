// api/src/main.js
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";

// Routes internes
import authRouter, { ensureAuth } from "./modules/auth.js";
import userRouter from "./modules/user.js";
import xtreamRouter from "./modules/xtream.js";
import tmdbRouter from "./modules/tmdb.js";

/* ----------------------- App & Middlewares ----------------------- */

const app = express();

// Derrière un proxy (Portainer/traefik/nginx) → cookies SameSite=None, etc.
app.set("trust proxy", 1);

// CORS : accepte plusieurs origines séparées par des virgules
const origins =
  (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      // autorise requêtes sans Origin (ex: curl/healthchecks)
      if (!origin) return cb(null, true);
      if (origins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

/* ----------------------------- Routes ---------------------------- */

app.get("/health", (_req, res) => res.json({ ok: true }));

// Auth publique
app.use("/auth", authRouter);

// Zones protégées par JWT (cookie httpOnly)
app.use("/user", ensureAuth, userRouter);
app.use("/xtream", ensureAuth, xtreamRouter);
app.use("/tmdb", ensureAuth, tmdbRouter);

/* --------------------- 404 & Error Handlers ---------------------- */

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
  // Évite de casser CORS sur erreur
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

/* --------------------------- Boot server ------------------------- */

const port = Number(process.env.API_PORT || 4000);
app.listen(port, () => {
  console.log(`API on :${port}`);
});
