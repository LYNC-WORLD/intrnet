import { Router } from "express";
import * as referenceController from "../controllers/referenceController";
import { authenticateJWT } from "../middleware/auth";

const router = Router();

router.get("/participants", authenticateJWT, referenceController.listParticipants);
router.get("/agreement", authenticateJWT, referenceController.getAgreement);

export default router;
