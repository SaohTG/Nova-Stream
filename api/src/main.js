// api/src/main.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

// Router par défaut exporté depuis modules/user.js
import userRouter from "./modules/user.js";

const app = express();

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(morgan("tiny"));

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://85.31.239.110:5173";

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

// Santé
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ✅ Monte sur / et /api pour éviter les 404 selon le front
app.use(userRouter);         // -> /user/link-xtream
app.use("/api", userRouter); // -> /api/user/link-xtream

// 404 JSON
app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

// Error handler JSON
app.use((err, _req, res, _next) => {
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || "Internal Error" });
});

const PORT = Number(process.env.API_PORT || 4000);
app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
});
