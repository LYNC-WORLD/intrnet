/** OpenAPI 3.0 document for the Intrnet REST API. Served at /api/docs */
import { openApiComponents, routeResponseSchemas } from "./schemas";

const json = (schema: object) => ({
  "application/json": { schema },
});

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Intrnet API",
    version: "1.0.0",
    description:
      "Multi-agreement netting and settlement API backed by Canton/Daml.\n\n" +
      "**Authentication:** Protected routes require `Authorization: Bearer <oauth-access-token>`. " +
      "Call `POST /api/auth/oauth/login` once to link your OAuth identity.\n\n" +
      "**Required vs optional:** Request bodies list required fields in each schema's `required` array. " +
      "Fields not listed there are optional. Query parameters marked `required: false` are optional.",
  },
  servers: [{ url: "/", description: "Current host" }],
  tags: [
    { name: "Auth" },
    { name: "Onboarding" },
    { name: "Admin" },
    { name: "Agreements" },
    { name: "Reference" },
    { name: "FX Rates" },
    { name: "Obligations" },
    { name: "Cycles" },
    { name: "Positions" },
    { name: "Settlement" },
    { name: "Health" },
  ],
  components: openApiComponents,
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness check",
        security: [],
        responses: {
          "200": {
            description: "Service is up",
            content: json({ $ref: "#/components/schemas/HealthResponse" }),
          },
        },
      },
    },
    "/api/auth/oauth/login": {
      post: {
        tags: ["Auth"],
        summary: "Register or link OAuth identity",
        security: [],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/OAuthLoginRequest" }),
        },
        responses: {
          "200": {
            description: "User linked or created",
            content: json({ $ref: "#/components/schemas/OAuthLoginResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user profile",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current user",
            content: json({ $ref: "#/components/schemas/MeResponse" }),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout (client-side token discard)",
        security: [{ bearerAuth: [] }],
        responses: {
          "204": { description: "No content — discard token on client" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/onboarding/submit": {
      post: {
        tags: ["Onboarding"],
        summary: "Submit onboarding request",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/OnboardingSubmitRequest" }),
        },
        responses: {
          "200": {
            description: "Onboarding request saved",
            content: json({ $ref: "#/components/schemas/OnboardingSubmitResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/admin/companies": {
      get: {
        tags: ["Admin"],
        summary: "List approved companies (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "agreementId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Optional filter by agreement",
          },
        ],
        responses: {
          "200": {
            description: "Active participant companies",
            content: json(routeResponseSchemas.companyList),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/parties": {
      get: {
        tags: ["Admin"],
        summary: "List ledger parties (operator)",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Parties on the operator participant",
            content: json(routeResponseSchemas.partyList),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/onboarding/requests": {
      get: {
        tags: ["Admin"],
        summary: "List onboarding requests (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"],
            },
            description: "Optional filter by request state",
          },
        ],
        responses: {
          "200": {
            description: "Onboarding requests with linked user",
            content: json(routeResponseSchemas.onboardingRequestList),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/onboarding/requests/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get onboarding request (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Onboarding request detail",
            content: json(routeResponseSchemas.onboardingRequestDetail),
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/onboarding/requests/{id}/approve": {
      post: {
        tags: ["Admin"],
        summary: "Approve onboarding request (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: json({ $ref: "#/components/schemas/ApproveOnboardingRequest" }),
        },
        responses: {
          "200": {
            description: "User provisioned on ledger",
            content: json(routeResponseSchemas.approveOnboarding),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/api/admin/onboarding/requests/{id}/reject": {
      post: {
        tags: ["Admin"],
        summary: "Reject onboarding request (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/RejectOnboardingRequest" }),
        },
        responses: {
          "200": {
            description: "Request rejected",
            content: json(routeResponseSchemas.rejectOnboarding),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/deposits/sync": {
      post: {
        tags: ["Admin"],
        summary: "Accept pending tUSD transfers and reconcile custody deposits (operator)",
        description:
          "Accepts pending CIP-56 TransferInstruction contracts addressed to the operator custody party, " +
          "then scans custody tUSD holdings and idempotently credits holdings whose transfer reference " +
          "is a depositor party id (Canton Registry Offer Transfer Reference field).",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Reconciliation report", content: json({ type: "object" }) },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/balances/credit": {
      post: {
        tags: ["Admin"],
        summary: "Manually credit a participant tUSD balance (operator)",
        description:
          "Credits an ACTIVE participant's internal settlement balance when automatic deposit attribution fails. " +
          "Use holdingContractId from sync unattributed list for idempotent DEPOSIT credits, or referenceId for a standalone MANUAL_CREDIT.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/ManualBalanceCreditRequest" }),
        },
        responses: {
          "200": {
            description: "Balance credited (or already applied)",
            content: json(routeResponseSchemas.partyBalance),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/admin/instruments": {
      get: {
        tags: ["Admin"],
        summary: "Discover tUSD registry instruments + admin party (operator)",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Registry instruments and discovered admin", content: json({ type: "object" }) },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/pqs/health": {
      get: {
        tags: ["Admin"],
        summary: "PQS read-model health (operator)",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "PQS connected",
            content: json({ $ref: "#/components/schemas/PqsHealthResponse" }),
          },
          "503": {
            description: "PQS unavailable",
            content: json({ $ref: "#/components/schemas/PqsHealthResponse" }),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/agreements": {
      get: {
        tags: ["Agreements"],
        summary: "List agreements (operator)",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "All netting agreements",
            content: json({ $ref: "#/components/schemas/AgreementListResponse" }),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Agreements"],
        summary: "Create agreement (operator)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/CreateAgreementRequest" }),
        },
        responses: {
          "201": {
            description: "Agreement created on ledger",
            content: json({ $ref: "#/components/schemas/LedgerContractCreateResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/api/agreements/{agreementId}": {
      get: {
        tags: ["Agreements"],
        summary: "Get agreement by ID",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "agreementId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Agreement from PQS read model",
            content: json({ $ref: "#/components/schemas/AgreementResponse" }),
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/agreement": {
      get: {
        tags: ["Reference"],
        summary: "Current user's agreement",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "agreementId",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Required — user's agreement ID",
          },
        ],
        responses: {
          "200": {
            description: "Agreement ledger payload",
            content: json({ $ref: "#/components/schemas/AgreementDetailResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/participants": {
      get: {
        tags: ["Reference"],
        summary: "Participants in an agreement",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "agreementId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Registered participants for the agreement",
            content: json(routeResponseSchemas.participantList),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/fx-rates": {
      get: {
        tags: ["FX Rates"],
        summary: "List FX rates",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "fromCurrency", in: "query", required: false, schema: { type: "string" } },
          { name: "toCurrency", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Active FX oracle contracts",
            content: json(routeResponseSchemas.fxRateList),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["FX Rates"],
        summary: "Create FX rate oracle contract (operator)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/CreateFxRateRequest" }),
        },
        responses: {
          "201": {
            description: "FX rate contract created",
            content: json({ $ref: "#/components/schemas/LedgerContractCreateResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/fx-rates/refresh": {
      post: {
        tags: ["FX Rates"],
        summary: "Refresh rates from external oracle (operator)",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Refresh completed",
            content: json({ $ref: "#/components/schemas/ApiSuccessEnvelope" }),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/fx-rates/{contractId}": {
      put: {
        tags: ["FX Rates"],
        summary: "Update FX rate (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/UpdateFxRateRequest" }),
        },
        responses: {
          "200": {
            description: "Rate updated on ledger",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/obligations": {
      get: {
        tags: ["Obligations"],
        summary: "List obligations",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["PENDING", "ACCEPTED", "NETTED", "REJECTED"],
            },
          },
          {
            name: "role",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["payer", "receiver"] },
          },
          { name: "currency", in: "query", required: false, schema: { type: "string" } },
          { name: "agreementId", in: "query", required: false, schema: { type: "string" } },
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": {
            description: "Paginated obligations",
            content: json({ $ref: "#/components/schemas/ObligationListResponse" }),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Obligations"],
        summary: "Create obligation",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/CreateObligationRequest" }),
        },
        responses: {
          "201": {
            description: "Obligation created on ledger",
            content: json({ $ref: "#/components/schemas/LedgerContractCreateResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/obligations/{contractId}": {
      get: {
        tags: ["Obligations"],
        summary: "Get obligation by contract ID",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Obligation detail",
            content: json({ $ref: "#/components/schemas/ObligationResponse" }),
          },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/obligations/{contractId}/accept": {
      post: {
        tags: ["Obligations"],
        summary: "Accept obligation (receiver)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Obligation accepted",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/obligations/{contractId}/reject": {
      post: {
        tags: ["Obligations"],
        summary: "Reject obligation (receiver)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: json({ $ref: "#/components/schemas/RejectObligationRequest" }),
        },
        responses: {
          "200": {
            description: "Obligation rejected (archived on ledger)",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/cycles": {
      get: {
        tags: ["Cycles"],
        summary: "List netting cycles",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "agreementId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Optional; participants are scoped to their agreement",
          },
        ],
        responses: {
          "200": {
            description: "Netting cycles",
            content: json({ $ref: "#/components/schemas/CycleListResponse" }),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Cycles"],
        summary: "Start netting cycle (operator)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: json({ $ref: "#/components/schemas/StartCycleRequest" }),
        },
        responses: {
          "201": {
            description: "Cycle started on ledger",
            content: json({ $ref: "#/components/schemas/StartCycleResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/cycles/{contractId}": {
      get: {
        tags: ["Cycles"],
        summary: "Get cycle by contract ID or cycleId",
        description:
          "Accepts either the ledger contract id or the stable `cycleId` text field. " +
          "Returns cycle fields plus gate summary (`canSettle`, `canForceSettle`, `canClose`, `pendingAckCount`). " +
          "Use `positionCids.length > 0` to detect that compute has been called.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Cycle with workflow gate flags",
            content: json({ $ref: "#/components/schemas/CycleDetailResponse" }),
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/cycles/{contractId}/obligations": {
      get: {
        tags: ["Cycles"],
        summary: "List obligations in a cycle",
        description:
          "Resolves obligations from the cycle's `obligationCids` on ledger. " +
          "Obligations are `ACCEPTED` after add-obligations and become `NETTED` only after compute.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Obligations linked to the cycle",
            content: json({ $ref: "#/components/schemas/ObligationListResponse" }),
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/cycles/{contractId}/add-obligations": {
      post: {
        tags: ["Cycles"],
        summary: "Add accepted obligations to cycle (operator)",
        description:
          "Adds all `ACCEPTED` obligations for the agreement to the cycle. Obligations remain `ACCEPTED` until " +
          "`POST /api/cycles/{contractId}/compute` runs `ComputeNetPositions` and `MarkAsNetted`.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Updated cycle contract ID after bulk add",
            content: json(routeResponseSchemas.newContractId),
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/cycles/{contractId}/compute": {
      post: {
        tags: ["Cycles"],
        summary: "Compute net positions (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: json({ $ref: "#/components/schemas/ComputeCycleRequest" }),
        },
        responses: {
          "200": {
            description: "Positions computed on ledger",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "409": { $ref: "#/components/responses/Conflict" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/cycles/{contractId}/settle": {
      post: {
        tags: ["Cycles"],
        summary: "Settle cycle (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Settlement instructions created",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "409": { $ref: "#/components/responses/Conflict" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/cycles/{contractId}/force-settle": {
      post: {
        tags: ["Cycles"],
        summary: "Force settle cycle after ack deadline (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Settlement instructions created (force)",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "409": { $ref: "#/components/responses/Conflict" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/cycles/{contractId}/close": {
      post: {
        tags: ["Cycles"],
        summary: "Close cycle (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Cycle closed on ledger",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "409": { $ref: "#/components/responses/Conflict" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/positions": {
      get: {
        tags: ["Positions"],
        summary: "List net positions",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "cycleId", in: "query", required: false, schema: { type: "string" } },
          { name: "agreementId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Net positions for a cycle or agreement",
            content: json(routeResponseSchemas.positionList),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/positions/{contractId}/acknowledge": {
      post: {
        tags: ["Positions"],
        summary: "Acknowledge net position (participant)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Position acknowledged",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/instructions": {
      get: {
        tags: ["Settlement"],
        summary: "List settlement instructions",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "agreementId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Settlement instructions",
            content: json(routeResponseSchemas.settlementInstructionList),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/balance": {
      get: {
        tags: ["Settlement"],
        summary: "Get tUSD settlement balance for current party",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Party balance with optional Canton Holdings total",
            content: json(routeResponseSchemas.partyBalance),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/balances": {
      get: {
        tags: ["Settlement"],
        summary: "List tUSD settlement balances",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Balances visible to the user (operator sees all)",
            content: json(routeResponseSchemas.partyBalanceList),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/{contractId}/execute": {
      post: {
        tags: ["Settlement"],
        summary: "Execute settlement with automatic CIP-56 custody payout (operator)",
        description:
          "Reserves the payer balance, transfers real settlement tokens from operator custody to the " +
          "receiver via the CIP-56 TransferFactory, attests the Canton updateId on the settlement " +
          "instruction, and debits the payer's reserved balance.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Real token payout completed and settlement attested on ledger",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/{contractId}/fail": {
      post: {
        tags: ["Settlement"],
        summary: "Mark a PENDING settlement instruction as FAILED (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: json({ $ref: "#/components/schemas/FailSettlementRequest" }),
        },
        responses: {
          "200": {
            description: "Instruction marked FAILED; reserved funds released",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/{contractId}/confirm": {
      post: {
        tags: ["Settlement"],
        summary: "Confirm settlement (receiver participant)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Settlement confirmed",
            content: json({ $ref: "#/components/schemas/LedgerExerciseResponse" }),
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
  },
} as const;
