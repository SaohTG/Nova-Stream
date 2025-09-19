// api/src/main.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // accepte x-www-form-urlencoded
app.use(cookieParser());

// CORS
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://85.31.239.110:5173";
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

// Santé
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Monte les routers (sur / et /api)
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

  // XTREAM
  try {
    const { default: xtreamRouter } = await import("./modules/xtream.js");
    app.use(xtreamRouter);
    app.use("/api", xtreamRouter);
  } catch (e) {
    console.warn("xtream router not found:", e?.message);
  }
}
await mountRouters();

// 404 + Error handler
app.use((_req, res) => res.status(404).json({ error: "Not Found" }));
app.use((err, _req, res, _next) =>
  res.status(err?.status || 500).json({ error: err?.message || "Internal Error" })
);

const PORT = Number(process.env.API_PORT || 4000);
app.listen(PORT, () => console.log(`API on :${PORT}`));
