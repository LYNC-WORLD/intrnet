import { Router } from "express";
import * as adminController from "../controllers/adminController";
import { authenticateOAuth, requireOperator } from "../middleware/auth";

const router = Router();

router.get("/companies", authenticateOAuth, requireOperator, adminController.listCompanies);
router.get("/parties", authenticateOAuth, requireOperator, adminController.listParties);
router.get("/onboarding/requests", authenticateOAuth, requireOperator, adminController.listOnboardingRequests);
router.get("/onboarding/requests/:id", authenticateOAuth, requireOperator, adminController.getOnboardingRequest);
router.post("/onboarding/requests/:id/approve", authenticateOAuth, requireOperator, adminController.approveOnboardingRequest);
router.post("/onboarding/requests/:id/reject", authenticateOAuth, requireOperator, adminController.rejectOnboarding);

export default router;
