import { Router } from "express";
import * as referenceController from "../controllers/referenceController";
import { authenticateOAuth, requireActiveUser } from "../middleware/auth";

const router = Router();

router.get("/participants", authenticateOAuth, requireActiveUser, referenceController.listParticipants);
router.get("/agreement", authenticateOAuth, requireActiveUser, referenceController.getAgreement);

export default router;
