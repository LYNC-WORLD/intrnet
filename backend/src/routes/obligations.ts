import { Router } from "express";
import * as obligationsController from "../controllers/obligationsController";
import { authenticateJWT } from "../middleware/auth";

const router = Router();

router.get("/", authenticateJWT, obligationsController.list);
router.get("/:contractId", authenticateJWT, obligationsController.getById);
router.post("/", authenticateJWT, obligationsController.create);
router.post("/:contractId/accept", authenticateJWT, obligationsController.accept);
router.post("/:contractId/reject", authenticateJWT, obligationsController.reject);

export default router;
