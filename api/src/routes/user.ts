import { Router } from "express";
import { resolveUserParam } from "../middleware/resolveMe";
const router = Router();

// active le param-resolver pour :id et :userId
router.param("id", resolveUserParam("id"));
router.param("userId", resolveUserParam("userId"));

// ... tes routes ensuite, par ex:
router.post("/user/:id/xtream/link", linkXtreamHandler);
router.get("/user/:id", getUserHandler);
// ...
export default router;
