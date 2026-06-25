import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "../openapi/spec";

const router = Router();

router.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

router.use("/", swaggerUi.serve);
router.get("/", swaggerUi.setup(openApiSpec, { customSiteTitle: "Intrnet API" }));

export default router;
