import { Router } from "express";
import * as authController from "../controllers/authController";
import { authenticateOAuth } from "../middleware/auth";

const router = Router();

router.post("/oauth/login", authController.oauthLogin);
router.get("/me", authenticateOAuth, authController.getMe);
router.post("/logout", authenticateOAuth, (_req, res) => res.status(204).end());

export default router;
