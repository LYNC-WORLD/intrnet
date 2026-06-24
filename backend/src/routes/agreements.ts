import { Router } from "express";
import * as agreementsController from "../controllers/agreementsController";
import { authenticateOAuth, requireActiveUser, requireOperator } from "../middleware/auth";

const router = Router();

router.post("/", authenticateOAuth, requireOperator, agreementsController.create);
router.get("/", authenticateOAuth, requireOperator, agreementsController.list);
router.get("/:agreementId", authenticateOAuth, requireActiveUser, agreementsController.getById);

export default router;
