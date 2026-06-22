import { Router } from "express";
import * as settlementController from "../controllers/settlementController";
import { authenticateOAuth, requireActiveUser, requireOperator } from "../middleware/auth";

const router = Router();

router.get("/instructions", authenticateOAuth, requireActiveUser, settlementController.listInstructions);
router.get("/accounts", authenticateOAuth, requireActiveUser, settlementController.listAccounts);
router.post("/:contractId/execute", authenticateOAuth, requireOperator, settlementController.execute);
router.post("/:contractId/confirm", authenticateOAuth, requireActiveUser, settlementController.confirm);

export default router;
