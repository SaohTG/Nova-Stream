// api/src/middleware/resolveMe.js
import jwt from "jsonwebtoken";

/**
 * Auth souple pour les flux:
 * - Accepte les cookies: nova_access | ns_access | ns_session
 * - Si expiré: tente nova_refresh | ns_refresh et regénère nova_access
 */

const ACCESS_TTL_SEC = Number(process.env.API_JWT_ACCESS_TTL || 900);
const ACCESS_SECRET  = process.env.API_JWT_SECRET || "Y7dD6Vh2mC4pQ8tR1sX9zK3wL5aN0fB2gU4hJ6iO8lT1qP3dV";
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || "mZ2xL7nH3qK9tC8vS4pD0rG6yB1wF5aE7uJ9hQ3oN2lM4kR8";

function cookieBaseOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.FORCE_SECURE_COOKIES === "true");
  return {
    httpOnly: true,
    secure,
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    path: "/",
  };
}

function setAccessCookie(res, accessToken) {
  res.cookie("nova_access", accessToken, {
    ...cookieBaseOptions(),
    maxAge: ACCESS_TTL_SEC * 1000,
  });
}

function firstCookie(req, names) {
  for (const n of names) {
    const v = req.cookies?.[n];
    if (v) return v;
  }
  return null;
}

export function requireAuthUserId(req, res) {
  // 1) Access direct: nova_access | ns_access | ns_session
  const accessTok = firstCookie(req, ["nova_access", "ns_access", "ns_session"]);
  if (accessTok) {
    try {
      const p = jwt.verify(accessTok, ACCESS_SECRET);
      if (p?.sub) return p.sub;
    } catch (_) {
      // expiré/invalid → on tentera refresh
    }
  }

  // 2) Refresh: nova_refresh | ns_refresh
  const refreshTok = firstCookie(req, ["nova_refresh", "ns_refresh"]);
  if (refreshTok) {
    try {
      const p = jwt.verify(refreshTok, REFRESH_SECRET);
      if (p?.sub) {
        const newAccess = jwt.sign({ sub: p.sub, typ: "access" }, ACCESS_SECRET, {
          expiresIn: ACCESS_TTL_SEC,
        });
        setAccessCookie(res, newAccess);
        return p.sub;
      }
    } catch (_) {
      // invalide
    }
  }

  const err = Object.assign(new Error("unauthorized"), { status: 401 });
  throw err;
}

// Middleware Express
export function requireAccess(req, res, next) {
  try {
    const uid = requireAuthUserId(req, res);
    // exposer un champ cohérent
    req.userId = uid;
    if (!req.user) req.user = { sub: uid };
    next();
  } catch (e) {
    res.status(e?.status || 401).json({ message: "unauthorized" });
  }
}
