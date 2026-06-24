import { Router } from "express";
import * as fxRatesController from "../controllers/fxRatesController";
import { authenticateOAuth, requireActiveUser, requireOperator } from "../middleware/auth";

const router = Router();

router.get("/", authenticateOAuth, requireActiveUser, fxRatesController.list);
router.post("/", authenticateOAuth, requireOperator, fxRatesController.create);
router.put("/:contractId", authenticateOAuth, requireOperator, fxRatesController.update);
router.post("/refresh", authenticateOAuth, requireOperator, fxRatesController.refresh);

export default router;
