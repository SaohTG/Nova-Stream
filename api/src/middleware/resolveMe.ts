// api/src/middleware/resolveMe.ts
import { Request, Response, NextFunction } from "express";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function requireAuthUserId(req: Request): string {
  // adapte selon ton middleware JWT : sub / userId / id
  const id =
    (req as any).auth?.userId ||
    (req as any).user?.id ||
    (req as any).jwt?.sub ||
    (req as any).jwt?.uid;

  if (!id) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  if (!UUID_RE.test(id)) {
    throw Object.assign(new Error("Invalid user id"), { status: 400 });
  }
  return id;
}

// (facultatif si tu veux continuer à accepter /user/me/... en param)
export function resolveUserParam(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction, val: string) => {
    try {
      let id = val;
      if (id === "me") id = requireAuthUserId(req);
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
        return res.status(400).json({ error: "Invalid user id" });
      }
      req.params[paramName] = id;
      next();
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message || "Error" });
    }
  };
}
