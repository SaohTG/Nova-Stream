// api/src/middleware/resolveMe.js
import jwt from "jsonwebtoken";

const ACCESS_TTL_SEC = Number(process.env.API_JWT_ACCESS_TTL || 900);
const ACCESS_SECRET  = process.env.API_JWT_SECRET  || "dev_access_secret";
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || "dev_refresh_secret";

function cookieBaseOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.FORCE_SECURE_COOKIES === "true");
  return { httpOnly: true, secure, sameSite: process.env.COOKIE_SAMESITE || "lax", path: "/" };
}
function setAccessCookie(res, tok) {
  res.cookie("nova_access", tok, { ...cookieBaseOptions(), maxAge: ACCESS_TTL_SEC * 1000 });
}
function firstCookie(req, names){ for(const n of names){ const v=req.cookies?.[n]; if(v) return v; } return null; }

export function requireAuthUserId(req, res){
  // 1) Bearer header (utilisé par Shaka)
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    try {
      const p = jwt.verify(auth.slice(7), ACCESS_SECRET);
      if (p?.sub) return p.sub;
    } catch {}
  }

  // 2) Access cookies compatibles
  const accessTok = firstCookie(req, ["nova_access","ns_access","ns_session"]);
  if (accessTok) {
    try { const p = jwt.verify(accessTok, ACCESS_SECRET); if (p?.sub) return p.sub; } catch {}
  }

  // 3) Refresh → régénère access
  const refreshTok = firstCookie(req, ["nova_refresh","ns_refresh"]);
  if (refreshTok) {
    try {
      const p = jwt.verify(refreshTok, REFRESH_SECRET);
      if (p?.sub) {
        const newAccess = jwt.sign({ sub:p.sub, typ:"access" }, ACCESS_SECRET, { expiresIn: ACCESS_TTL_SEC });
        setAccessCookie(res, newAccess);
        return p.sub;
      }
    } catch {}
  }

  const err = Object.assign(new Error("unauthorized"), { status: 401 });
  throw err;
}

export function requireAccess(req,res,next){
  try{
    const uid = requireAuthUserId(req,res);
    req.userId = uid;
    if (!req.user) req.user = { sub: uid };
    next();
  }catch(e){
    res.status(e?.status||401).json({ message:"unauthorized" });
  }
}
