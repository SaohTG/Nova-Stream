// api/src/middleware/resolveMe.js
import jwt from "jsonwebtoken";

/**
 * Auth via cookies:
 * - nova_access: JWT d’accès court
 * - nova_refresh: JWT de refresh si access manquant/expiré
 */

const ACCESS_TTL_SEC = Number(process.env.API_JWT_ACCESS_TTL || 900);
const ACCESS_SECRET =
  process.env.API_JWT_SECRET ||
  "Y7dD6Vh2mC4pQ8tR1sX9zK3wL5aN0fB2gU4hJ6iO8lT1qP3dV";
const REFRESH_SECRET =
  process.env.API_REFRESH_SECRET ||
  "mZ2xL7nH3qK9tC8vS4pD0rG6yB1wF5aE7uJ9hQ3oN2lM4kR8";

function cookieBaseOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" &&
      process.env.FORCE_SECURE_COOKIES === "true");

  return {
    httpOnly: true,
    secure, // false en HTTP pour Portainer si non forcé
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

export function requireAuthUserId(req, res) {
  // 1) access valide
  try {
    const tok = req.cookies?.nova_access;
    if (tok) {
      const payload = jwt.verify(tok, ACCESS_SECRET);
      if (payload?.sub) return payload.sub;
    }
  } catch {
    // ignore
  }

  // 2) refresh → régénère access
  const rtk = req.cookies?.nova_refresh;
  if (rtk) {
    try {
      const p = jwt.verify(rtk, REFRESH_SECRET);
      if (p?.sub) {
        const newAccess = jwt.sign(
          { sub: p.sub, typ: "access" },
          ACCESS_SECRET,
          { expiresIn: ACCESS_TTL_SEC }
        );
        setAccessCookie(res, newAccess);
        return p.sub;
      }
    } catch {
      // ignore
    }
  }

  const err = new Error("unauthorized");
  err.status = 401;
  throw err;
}

// Middleware Express classique (ancien usage possible)
export function requireAccess(req, res, next) {
  try {
    req.userId = requireAuthUserId(req, res);
    next();
  } catch (e) {
    res.status(e?.status || 401).json({ ok: false, error: "unauthorized" });
  }
}

// Compat pour vos routes existantes qui lisent req.user.sub
export function ensureAuthCompat(req, res, next) {
  try {
    const sub = requireAuthUserId(req, res);
    req.user = { sub };
    next();
  } catch {
    res.status(401).json({ message: "unauthorized" });
  }
}
