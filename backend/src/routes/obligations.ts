import { Router } from "express";
import * as obligationsController from "../controllers/obligationsController";
import { authenticateOAuth, requireActiveUser } from "../middleware/auth";

const router = Router();

router.get("/", authenticateOAuth, requireActiveUser, obligationsController.list);
router.get("/:contractId", authenticateOAuth, requireActiveUser, obligationsController.getById);
router.post("/", authenticateOAuth, requireActiveUser, obligationsController.create);
router.post("/:contractId/accept", authenticateOAuth, requireActiveUser, obligationsController.accept);
router.post("/:contractId/reject", authenticateOAuth, requireActiveUser, obligationsController.reject);

export default router;
