// api/src/middleware/resolveMe.js
import jwt from "jsonwebtoken";

const ACCESS_TTL_SEC = Number(process.env.API_JWT_ACCESS_TTL || 900);
const ACCESS_SECRET  = process.env.API_JWT_SECRET || "dev_access_secret";
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || "dev_refresh_secret";
const D = (...a) => { if (process.env.DEBUG_AUTH === "1") console.log("[AUTH]", ...a); };

function cookieBaseOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.FORCE_SECURE_COOKIES === "true");
  return { httpOnly: true, secure, sameSite: process.env.COOKIE_SAMESITE || "lax", path: "/" };
}
function setAccessCookie(res, tok) {
  res.cookie("nova_access", tok, { ...cookieBaseOptions(), maxAge: ACCESS_TTL_SEC * 1000 });
}
function firstCookie(req, names) { for (const n of names) { const v = req.cookies?.[n]; if (v) return v; } return null; }

export function requireAuthUserId(req, res) {
  const accessTok = firstCookie(req, ["nova_access", "ns_access", "ns_session"])
                 || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (accessTok) {
    try {
      const p = jwt.verify(accessTok, ACCESS_SECRET);
      D("access ok sub=", p?.sub);
      if (p?.sub) return p.sub;
    } catch (e) {
      D("access invalid:", e?.name || e?.message);
    }
  }

  const refreshTok = firstCookie(req, ["nova_refresh", "ns_refresh"]);
  if (refreshTok) {
    try {
      const p = jwt.verify(refreshTok, REFRESH_SECRET);
      if (p?.sub) {
        const newAccess = jwt.sign({ sub: p.sub, typ: "access" }, ACCESS_SECRET, { expiresIn: ACCESS_TTL_SEC });
        setAccessCookie(res, newAccess);
        D("refresh ok → new access, sub=", p.sub);
        return p.sub;
      }
    } catch (e) {
      D("refresh invalid:", e?.name || e?.message);
    }
  }

  D("unauthorized. cookies:", Object.keys(req.cookies || {}));
  const err = Object.assign(new Error("unauthorized"), { status: 401 });
  throw err;
}

export function requireAccess(req, res, next) {
  try {
    const uid = requireAuthUserId(req, res);
    req.userId = uid;
    if (!req.user) req.user = { sub: uid };
    next();
  } catch (e) {
    res.status(e?.status || 401).json({ message: "unauthorized" });
  }
}
