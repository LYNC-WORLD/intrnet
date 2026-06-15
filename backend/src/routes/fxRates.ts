import { Router } from "express";
import * as fxRatesController from "../controllers/fxRatesController";
import { authenticateJWT, requireOperator } from "../middleware/auth";

const router = Router();

router.get("/", authenticateJWT, fxRatesController.list);
router.post("/", authenticateJWT, requireOperator, fxRatesController.create);
router.put("/:contractId", authenticateJWT, requireOperator, fxRatesController.update);
router.post("/refresh", authenticateJWT, requireOperator, fxRatesController.refresh);

export default router;
