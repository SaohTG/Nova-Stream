// api/src/middleware/resolveMe.ts
import { Request, Response, NextFunction } from "express";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function resolveUserParam(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction, val: string) => {
    let id = val;
    // req.auth.userId (ou req.user.id) doit être posé par ton middleware JWT
    const authedId = (req as any).auth?.userId || (req as any).user?.id;

    if (id === "me") {
      if (!authedId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      id = authedId;
    }

    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    // remplace le param par l’UUID final
    req.params[paramName] = id;
    return next();
  };
}
