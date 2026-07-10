import { Router } from "express";
import * as settlementController from "../controllers/settlementController";
import { authenticateOAuth, requireActiveUser, requireOperator } from "../middleware/auth";

const router = Router();

router.get("/instructions", authenticateOAuth, requireActiveUser, settlementController.listInstructions);
router.get("/balance", authenticateOAuth, requireActiveUser, settlementController.getBalance);
router.get("/balances", authenticateOAuth, requireActiveUser, settlementController.listBalances);
router.post("/:contractId/execute", authenticateOAuth, requireOperator, settlementController.execute);
router.post("/:contractId/fail", authenticateOAuth, requireOperator, settlementController.fail);
router.post("/:contractId/confirm", authenticateOAuth, requireActiveUser, settlementController.confirm);

export default router;
