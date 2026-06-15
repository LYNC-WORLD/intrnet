import { Router } from "express";
import * as cyclesController from "../controllers/cyclesController";
import { authenticateJWT, requireOperator } from "../middleware/auth";

const router = Router();

router.get("/", authenticateJWT, cyclesController.list);
router.get("/:contractId", authenticateJWT, cyclesController.getById);
router.post("/", authenticateJWT, requireOperator, cyclesController.start);
router.post("/:contractId/add-obligations", authenticateJWT, requireOperator, cyclesController.addObligations);
router.post("/:contractId/compute", authenticateJWT, requireOperator, cyclesController.compute);

export default router;
