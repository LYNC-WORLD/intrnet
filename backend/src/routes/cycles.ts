import { Router } from "express";
import * as cyclesController from "../controllers/cyclesController";
import { authenticateOAuth, requireActiveUser, requireOperator } from "../middleware/auth";

const router = Router();

router.get("/", authenticateOAuth, requireActiveUser, cyclesController.list);
router.get("/:contractId/obligations", authenticateOAuth, requireActiveUser, cyclesController.listObligations);
router.get("/:contractId", authenticateOAuth, requireActiveUser, cyclesController.getById);
router.post("/", authenticateOAuth, requireOperator, cyclesController.start);
router.post("/:contractId/add-obligations", authenticateOAuth, requireOperator, cyclesController.addObligations);
router.post("/:contractId/compute", authenticateOAuth, requireOperator, cyclesController.compute);
router.post("/:contractId/settle", authenticateOAuth, requireOperator, cyclesController.settle);
router.post("/:contractId/force-settle", authenticateOAuth, requireOperator, cyclesController.forceSettle);
router.post("/:contractId/close", authenticateOAuth, requireOperator, cyclesController.close);

export default router;
