import { Router } from "express";
import * as positionsController from "../controllers/positionsController";
import { authenticateOAuth, requireActiveUser } from "../middleware/auth";

const router = Router();

router.get("/", authenticateOAuth, requireActiveUser, positionsController.list);
router.post("/:contractId/acknowledge", authenticateOAuth, requireActiveUser, positionsController.acknowledge);

export default router;
