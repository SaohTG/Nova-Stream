// api/src/main.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
// import morgan from "morgan"; // ⬅️ retiré
import userRouter from "./modules/user.js";

const app = express();
app.use(express.json());
app.use(cookieParser());
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://85.31.239.110:5173";
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
// app.use(morgan("tiny")); // ⬅️ retiré

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use(userRouter);
app.use("/api", userRouter);

app.use((_req, res) => res.status(404).json({ error: "Not Found" }));
app.use((err, _req, res, _next) =>
  res.status(err?.status || 500).json({ error: err?.message || "Internal Error" })
);

const PORT = Number(process.env.API_PORT || 4000);
app.listen(PORT, () => console.log(`API on :${PORT}`));
