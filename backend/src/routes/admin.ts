import { Router } from "express";
import * as adminController from "../controllers/adminController";
import { authenticateJWT, requireOperator } from "../middleware/auth";

const router = Router();

router.post("/companies", authenticateJWT, requireOperator, adminController.createCompany);
router.get("/companies", authenticateJWT, requireOperator, adminController.listCompanies);
router.get("/parties", authenticateJWT, requireOperator, adminController.listParties);

export default router;
