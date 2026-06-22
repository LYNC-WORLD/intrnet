import { Router } from "express";
import * as onboardingController from "../controllers/onboardingController";
import { authenticateOAuth } from "../middleware/auth";

const router = Router();

router.post("/submit", authenticateOAuth, onboardingController.submitMyRequest);

export default router;
