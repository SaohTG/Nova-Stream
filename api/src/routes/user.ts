import { Router } from "express";
import { getXtreamLink, upsertXtreamLink } from "../modules/user"; // ou xtream.ts
import { resolveUserParam } from "../middleware/resolveMe";
import { authRequired } from "../middleware/auth"; // ton middleware JWT

const router = Router();

// facultatif si tu gardes /user/:id/... ; sinon, tu peux aussi définir /user/me/...
router.param("id", resolveUserParam("id"));

// Protège tout par auth
router.use(authRequired);

// Routes Xtream
router.get("/user/:id/xtream/link", getXtreamLink);
router.post("/user/:id/xtream/link", upsertXtreamLink);

// ou plus simple (et conseillé) : expose directement /user/me/xtream/link
// router.get("/user/me/xtream/link", getXtreamLink);
// router.post("/user/me/xtream/link", upsertXtreamLink);

export default router;
