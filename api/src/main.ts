// api/src/main.ts
import express, { Request, Response, NextFunction } from "express";
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

// Endpoints santé
app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));
app.get("/api/health", (_req: Request, res: Response) => res.json({ ok: true }));

// Chargement dynamique des routeurs (supporte modules/ et routes/)
async function mountRouters() {
  // USER ROUTER
  try {
    const { default: userRouter } = await import("./modules/user.js");
    app.use(userRouter);
    app.use("/api", userRouter);
  } catch (e: any) {
    console.warn("userRouter not found at ./modules/user.js:", e?.message);
    try {
      const { default: userRouter2 } = await import("./routes/user.js");
      app.use(userRouter2);
      app.use("/api", userRouter2);
    } catch (e2: any) {
      console.warn("userRouter not found at ./routes/user.js:", e2?.message);
    }
  }

  // AUTH ROUTER
  let authMounted = false;
  try {
    const { default: authRouter } = await import("./modules/auth.js");
    app.use(authRouter);
    app.use("/api", authRouter);
    authMounted = true;
  } catch (e: any) {
    console.warn("authRouter not found at ./modules/auth.js:", e?.message);
    try {
      const { default: authRouter2 } = await import("./routes/auth.js");
      app.use(authRouter2);
      app.use("/api", authRouter2);
      authMounted = true;
    } catch (e2: any) {
      console.warn("authRouter not found at ./routes/auth.js:", e2?.message);
    }
  }

  if (!authMounted) {
    app.post(["/auth/signup", "/api/auth/signup"], (_req: Request, res: Response) =>
      res.status(501).json({ error: "Auth router missing" })
    );
    app.post(["/auth/login", "/api/auth/login"], (_req: Request, res: Response) =>
      res.status(501).json({ error: "Auth router missing" })
    );
  }
}

await mountRouters();

// 404 JSON par défaut
app.use((_req: Request, res: Response) => res.status(404).json({ error: "Not Found" }));

// Handler d'erreurs JSON
app.use((
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || "Internal Error" });
});

const PORT = Number(process.env.API_PORT || 4000);
app.listen(PORT, () => console.log(`API on :${PORT}`));
