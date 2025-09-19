// api/src/main.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

// Routes modules
import authRouter from "./modules/auth.js";
import userRouter from "./modules/user.js";
import xtreamRouter from "./modules/xtream.js";

const app = express();

/* ---------------------------- App configuration --------------------------- */

app.disable("x-powered-by");

// Si l'API est derrière un proxy/Portainer/nginx, on garde l'IP correcte
app.set("trust proxy", 1);

// Logs
app.use(morgan("dev"));

// Cookies (ns_access, ns_refresh)
app.use(cookieParser());

// CORS (avec cookies)
const ORIGIN = process.env.CORS_ORIGIN || "http://85.31.239.110:5173";
app.use(
  cors({
    origin: ORIGIN,       // ⚠️ pas "*"
    credentials: true,    // indispensable pour envoyer les cookies
  })
);

// JSON body
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* --------------------------------- Health --------------------------------- */

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "nova-stream-api" });
});

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

/* ---------------------------------- Routes -------------------------------- */

app.use(authRouter);
app.use(userRouter);
app.use(xtreamRouter);

/* ----------------------------- 404 & Error handler ------------------------ */

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found", path: req.path });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err?.status || 500;
  const message = err?.message || "Internal Server Error";
  if (status >= 500) {
    console.error("[API error]", message, err?.stack || "");
  }
  res.status(status).json({ ok: false, error: message });
});

/* ---------------------------------- Start --------------------------------- */

const port = Number(process.env.API_PORT || 4000);
app.listen(port, () => {
  console.log(`API on :${port}`);
});

/* -------------------------- Safety: unhandled errors ---------------------- */

process.on("unhandledRejection", (reason) => {
  console.error("UnhandledRejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UncaughtException:", err);
});
