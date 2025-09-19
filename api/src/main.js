// api/src/main.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// Middlewares de base
app.use(express.json());
app.use(cookieParser());

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

// Chargement/ montage des routers
async function mountRouters() {
  // USER
  try {
    const { default: userRouter } = await import("./modules/user.js");
    app.use(userRouter);
    app.use("/api", userRouter);
  } catch (e) {
    console.warn("user router not found:", e?.message);
  }

  // AUTH
  try {
    const { default: authRouter } = await import("./modules/auth.js");
    app.use(authRouter);
    app.use("/api", authRouter);
  } catch (e) {
    console.warn("auth router not found:", e?.message);
  }

  // XTREAM (✅ ajoute /xtream/test)
  try {
    const { default: xtreamRouter } = await import("./modules/xtream.js");
    app.use(xtreamRouter);
    app.use("/api", xtreamRouter);
  } catch (e) {
    console.warn("xtream router not found:", e?.message);
  }
}

await mountRouters();

// 404 JSON
app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

// Error handler JSON
app.use((err, _req, res, _next) => {
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || "Internal Error" });
});

const PORT = Number(process.env.API_PORT || 4000);
app.listen(PORT, () => console.log(`API on :${PORT}`));
