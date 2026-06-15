import { Router } from "express";
import * as positionsController from "../controllers/positionsController";
import { authenticateJWT } from "../middleware/auth";

const router = Router();

router.get("/", authenticateJWT, positionsController.list);

export default router;
