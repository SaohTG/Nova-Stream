// api/src/routes/user.ts
import express, { Request, Response } from "express";
import { resolveUserParam } from "../middleware/resolveMe";
import { authRequired } from "../middleware/auth"; // adapte si besoin

// ❗ import ESM d'un module JS : garder l'extension .js
import { getXtreamLink, upsertXtreamLink } from "../modules/user.js";

const router = express.Router();

// Optionnel : accepter /user/me/...
router.param("id", resolveUserParam("id"));

// JWT obligatoire
router.use(authRequired as any);

// Routes Xtream (handlers JS)
router.get("/user/:id/xtream/link", (req: Request, res: Response) =>
  getXtreamLink(req as any, res as any)
);
router.post("/user/:id/xtream/link", (req: Request, res: Response) =>
  upsertXtreamLink(req as any, res as any)
);

// Alternative (encore plus simple côté front) :
// router.get("/user/me/xtream/link", (req, res) => getXtreamLink(req as any, res as any));
// router.post("/user/me/xtream/link", (req, res) => upsertXtreamLink(req as any, res as any));

export default router;
