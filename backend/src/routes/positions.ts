import { Router } from "express";
import * as positionsController from "../controllers/positionsController";
import { authenticateJWT } from "../middleware/auth";

const router = Router();

router.get("/", authenticateJWT, positionsController.list);
router.post("/:contractId/acknowledge", authenticateJWT, positionsController.acknowledge);

export default router;
