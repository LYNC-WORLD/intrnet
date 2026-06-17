import { Router } from "express";
import * as agreementsController from "../controllers/agreementsController";
import { authenticateJWT, requireOperator } from "../middleware/auth";

const router = Router();

router.post("/", authenticateJWT, requireOperator, agreementsController.create);
router.get("/", authenticateJWT, requireOperator, agreementsController.list);
router.get("/:agreementId", authenticateJWT, agreementsController.getById);

export default router;
