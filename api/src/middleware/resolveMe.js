// api/src/middleware/resolveMe.js (ESM)
import jwt from "jsonwebtoken";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function requireAuthUserId(req) {
  let id =
    req?.auth?.userId ||
    req?.user?.id ||
    req?.jwt?.sub ||
    req?.jwt?.uid;

  if (!id) {
    const token = req?.cookies?.access_token;
    if (token) {
      try {
        const secret = process.env.API_JWT_SECRET;
        if (!secret) {
          const e = new Error("Server misconfigured (missing API_JWT_SECRET)");
          e.status = 500;
          throw e;
        }
        const payload = jwt.verify(token, secret);
        id = payload?.sub;
      } catch {
        /* ignore -> on tombera sur Unauthorized */
      }
    }
  }

  if (!id) {
    const e = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
  if (!UUID_RE.test(String(id))) {
    const e = new Error("Invalid user id");
    e.status = 400;
    throw e;
  }
  return String(id);
}

export function resolveUserParam(paramName = "id") {
  return (req, res, next, val) => {
    try {
      let id = val;
      if (id === "me") id = requireAuthUserId(req);
      if (!UUID_RE.test(String(id))) {
        return res.status(400).json({ error: "Invalid user id" });
      }
      req.params[paramName] = String(id);
      next();
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || "Error" });
    }
  };
}
