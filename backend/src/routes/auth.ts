import { Router } from "express";
import * as authController from "../controllers/authController";
import { authenticateJWT } from "../middleware/auth";

const router = Router();

router.post("/login", authController.login);
router.get("/me", authenticateJWT, authController.getMe);

export default router;
