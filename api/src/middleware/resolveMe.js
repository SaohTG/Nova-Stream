// api/src/middleware/resolveMe.js
import jwt from "jsonwebtoken";

/**
 * Ce middleware vérifie le cookie ns_access.
 * S'il est absent/expiré mais que ns_refresh est présent et valide,
 * il régénère un access token et continue.
 */

const ACCESS_TTL_SEC = Number(process.env.API_JWT_ACCESS_TTL || 900);
const ACCESS_SECRET = process.env.API_JWT_SECRET || "Y7dD6Vh2mC4pQ8tR1sX9zK3wL5aN0fB2gU4hJ6iO8lT1qP3dV";
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || "mZ2xL7nH3qK9tC8vS4pD0rG6yB1wF5aE7uJ9hQ3oN2lM4kR8";

function cookieBaseOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.FORCE_SECURE_COOKIES === "true");

  return {
    httpOnly: true,
    secure,                          // false en HTTP pour Portainer
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    path: "/",
  };
}

function setAccessCookie(res, accessToken) {
  res.cookie("ns_access", accessToken, {
    ...cookieBaseOptions(),
    maxAge: ACCESS_TTL_SEC * 1000,
  });
}

export function requireAuthUserId(req, res) {
  // version "sync" pour pouvoir l'appeler dans du code non-middleware
  try {
    const tok = req.cookies?.ns_access;
    if (tok) {
      const payload = jwt.verify(tok, ACCESS_SECRET);
      if (payload?.sub) return payload.sub;
    }
  } catch (_) {
    // ignore, on va tenter le refresh
  }

  // Fallback refresh
  const rtk = req.cookies?.ns_refresh;
  if (rtk) {
    try {
      const p = jwt.verify(rtk, REFRESH_SECRET);
      if (p?.sub) {
        const newAccess = jwt.sign({ sub: p.sub, typ: "access" }, ACCESS_SECRET, {
          expiresIn: ACCESS_TTL_SEC,
        });
        setAccessCookie(res, newAccess);
        return p.sub;
      }
    } catch (_) {
      // refresh invalide → on tombera en 401
    }
  }

  const err = new Error("unauthorized");
  err.status = 401;
  throw err;
}

// Variante middleware Express classique
export function requireAccess(req, res, next) {
  try {
    req.userId = requireAuthUserId(req, res);
    next();
  } catch (e) {
    res.status(e?.status || 401).json({ ok: false, error: "unauthorized" });
  }
}
