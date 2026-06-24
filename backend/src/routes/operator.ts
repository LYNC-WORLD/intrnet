import { Router } from "express";
import * as operatorController from "../controllers/operatorController";
import { authenticateOAuth, requireOperator } from "../middleware/auth";

const router = Router();

router.post("/fund-account", authenticateOAuth, requireOperator, operatorController.fundAccount);

export default router;
