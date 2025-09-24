// api/src/middleware/resolveMe.js
import jwt from "jsonwebtoken";

/* JWT conf */
const ACCESS_TTL_SEC = Number(process.env.API_JWT_ACCESS_TTL || 900);
const ACCESS_SECRET =
  process.env.API_JWT_SECRET ||
  "Y7dD6Vh2mC4pQ8tR1sX9zK3wL5aN0fB2gU4hJ6iO8lT1qP3dV";
const REFRESH_SECRET =
  process.env.API_REFRESH_SECRET ||
  "mZ2xL7nH3qK9tC8vS4pD0rG6yB1wF5aE7uJ9hQ3oN2lM4kR8";

/* cookies */
function cookieBaseOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" &&
      process.env.FORCE_SECURE_COOKIES === "true");
  return { httpOnly: true, secure, sameSite: process.env.COOKIE_SAMESITE || "lax", path: "/" };
}
function setAccessCookie(res, accessToken) {
  res.cookie("nova_access", accessToken, { ...cookieBaseOptions(), maxAge: ACCESS_TTL_SEC * 1000 });
}

/* utils */
function firstTruthy(...vals) { for (const v of vals) if (v) return v; return null; }
function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
function pickAccessToken(req) {
  // ordre: Authorization, nova_access, variantes historiques
  return firstTruthy(
    bearer(req),
    req.cookies?.nova_access,
    req.cookies?.ns_session,
    req.cookies?.token,
    req.cookies?.access_token
  );
}
function pickRefreshToken(req) {
  return firstTruthy(req.cookies?.nova_refresh, req.cookies?.refresh_token);
}
function verifyAny(token) {
  if (!token) return null;
  try { return jwt.verify(token, ACCESS_SECRET); } catch {}
  try { return jwt.verify(token, REFRESH_SECRET); } catch {}
  return null;
}

/* API sync pour récupérer un userId ou lever 401 */
export function requireAuthUserId(req, res) {
  // 1) access token: accepte Authorization ou cookies connus
  const accTok = pickAccessToken(req);
  const acc = verifyAny(accTok);
  if (acc?.sub) return acc.sub;

  // 2) refresh → regénère un access (seulement via secrets REFRESH)
  const rtk = pickRefreshToken(req);
  if (rtk) {
    try {
      const p = jwt.verify(rtk, REFRESH_SECRET);
      if (p?.sub) {
        const newAccess = jwt.sign({ sub: p.sub, typ: "access" }, ACCESS_SECRET, { expiresIn: ACCESS_TTL_SEC });
        setAccessCookie(res, newAccess);
        return p.sub;
      }
    } catch {}
  }

  const err = new Error("unauthorized");
  err.status = 401;
  throw err;
}

/* Middleware "ancien" (met req.userId) */
export function requireAccess(req, res, next) {
  try { req.userId = requireAuthUserId(req, res); next(); }
  catch (e) { res.status(e?.status || 401).json({ ok: false, error: "unauthorized" }); }
}

/* Middleware compat (met req.user.sub) */
export function ensureAuthCompat(req, res, next) {
  try {
    const sub = requireAuthUserId(req, res);
    req.user = { sub };
    next();
  } catch {
    res.status(401).json({ message: "unauthorized" });
  }
}
