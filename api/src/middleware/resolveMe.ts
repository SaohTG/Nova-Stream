// api/src/middleware/resolveMe.ts
import type { Request, Response, NextFunction } from "express";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function requireAuthUserId(req: Request): string {
  const id =
    (req as any).auth?.userId ||
    (req as any).user?.id ||
    (req as any).jwt?.sub ||
    (req as any).jwt?.uid;

  if (!id) {
    const err: any = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  if (!UUID_RE.test(id)) {
    const err: any = new Error("Invalid user id");
    err.status = 400;
    throw err;
  }
  return id;
}

/** Optionnel : permet d’accepter /user/me/... en résolvant "me" -> UUID du JWT */
export function resolveUserParam(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction, val: string) => {
    try {
      let id = val;
      if (id === "me") id = requireAuthUserId(req);
      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: "Invalid user id" });
      }
      req.params[paramName] = id;
      next();
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message || "Error" });
    }
  };
}
