// api/src/middleware/resolveMe.js
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

/**
 * Récupère l'UUID de l'utilisateur depuis le JWT (cookies)
 * Adapte selon ton middleware auth: req.auth.userId, req.user.id, req.jwt.sub, etc.
 */
export function requireAuthUserId(req) {
  const id =
    req?.auth?.userId ||
    req?.user?.id ||
    req?.jwt?.sub ||
    req?.jwt?.uid;

  if (!id) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  if (!UUID_RE.test(id)) {
    const err = new Error("Invalid user id");
    err.status = 400;
    throw err;
  }
  return id;
}

/**
 * (Facultatif) permet d'accepter /user/me/... en résolvant "me" -> UUID JWT
 * À brancher via router.param("id", resolveUserParam("id"))
 */
export function resolveUserParam(paramName = "id") {
  return (req, res, next, val) => {
    try {
      let id = val;
      if (id === "me") id = requireAuthUserId(req);
      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: "Invalid user id" });
      }
      req.params[paramName] = id;
      next();
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || "Error" });
    }
  };
}
