/** OpenAPI 3.0 document for the Intrnet REST API. Served at /api/docs */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Intrnet API",
    version: "1.0.0",
    description:
      "Multi-agreement netting and settlement API backed by Canton/Daml. " +
      "Protected routes require `Authorization: Bearer <oauth-access-token>`. " +
      "Call `POST /api/auth/oauth/login` once to link your OAuth identity before other requests.",
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
    { name: "Operator" },
    { name: "Health" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Auth0 / Canton OAuth access token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      ApiSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {},
        },
        required: ["success"],
      },
      OAuthLoginRequest: {
        type: "object",
        properties: { token: { type: "string", description: "OAuth access token from Auth0" } },
        required: ["token"],
      },
      OnboardingSubmitRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          companyName: { type: "string" },
          contactName: { type: "string" },
          phone: { type: "string" },
          country: { type: "string" },
          partyHint: { type: "string" },
        },
        required: ["email", "companyName"],
      },
      ApproveOnboardingRequest: {
        type: "object",
        properties: {
          partyHint: { type: "string" },
          agreementId: { type: "string" },
          agreementContractId: { type: "string" },
          initialBalance: { type: "string" },
        },
      },
      RejectOnboardingRequest: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
      CreateAgreementRequest: {
        type: "object",
        properties: {
          agreementId: { type: "string" },
          settlementCurrency: { type: "string", default: "USD" },
          agreementDate: { type: "string", format: "date" },
        },
        required: ["agreementId"],
      },
      CreateFxRateRequest: {
        type: "object",
        properties: {
          fromCurrency: { type: "string" },
          toCurrency: { type: "string" },
          rate: { type: "number" },
          asOf: { type: "string", format: "date-time" },
        },
        required: ["fromCurrency", "toCurrency", "rate"],
      },
      UpdateFxRateRequest: {
        type: "object",
        properties: {
          rate: { type: "number" },
          asOf: { type: "string", format: "date-time" },
        },
        required: ["rate"],
      },
      CreateObligationRequest: {
        type: "object",
        properties: {
          receiver: { type: "string", description: "Receiver party ID" },
          amount: { type: "string" },
          currency: { type: "string" },
          description: { type: "string" },
          invoiceRef: { type: "string" },
          agreementId: { type: "string", description: "Optional; auto-scoped for participants" },
        },
        required: ["receiver", "amount", "currency"],
      },
      RejectObligationRequest: {
        type: "object",
        properties: { reason: { type: "string" } },
      },
      StartCycleRequest: {
        type: "object",
        properties: {
          cycleId: { type: "string" },
          cutoffTime: { type: "string", format: "date-time" },
          agreementId: { type: "string" },
          agreementContractId: { type: "string" },
        },
        required: ["cycleId", "cutoffTime", "agreementId"],
      },
      ComputeCycleRequest: {
        type: "object",
        properties: {
          ackDeadline: {
            type: "string",
            format: "date-time",
            description: "Defaults to cycle cutoff time if omitted",
          },
        },
      },
      FundAccountRequest: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Party ID" },
          currency: { type: "string" },
          amount: { type: "number" },
        },
        required: ["owner", "currency", "amount"],
      },
    },
    responses: {
      Unauthorized: {
        description: "Missing or invalid bearer token",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Forbidden: {
        description: "Insufficient role or inactive user",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "Resource not found",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness check",
        security: [],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } },
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/OAuthLoginRequest" } } },
        },
        responses: {
          "200": { description: "User linked", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "400": { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user profile",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Profile", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout (client-side token discard)",
        security: [{ bearerAuth: [] }],
        responses: { "204": { description: "No content" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/onboarding/submit": {
      post: {
        tags: ["Onboarding"],
        summary: "Submit onboarding request",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/OnboardingSubmitRequest" } } },
        },
        responses: {
          "200": { description: "Request submitted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/admin/companies": {
      get: {
        tags: ["Admin"],
        summary: "List approved companies (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "agreementId", in: "query", schema: { type: "string" } }],
        responses: {
          "200": { description: "Company list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          "200": { description: "Party list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
        parameters: [{ name: "status", in: "query", schema: { type: "string" } }],
        responses: {
          "200": { description: "Request list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          "200": { description: "Request detail", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApproveOnboardingRequest" } } },
        },
        responses: {
          "200": { description: "Approved", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/RejectOnboardingRequest" } } },
        },
        responses: {
          "200": { description: "Rejected", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "400": { description: "Missing reason", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
          "200": { description: "PQS connected", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "503": { description: "PQS unavailable", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          "200": { description: "Agreement list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateAgreementRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
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
          "200": { description: "Agreement", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
        responses: {
          "200": { description: "Agreement", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/participants": {
      get: {
        tags: ["Reference"],
        summary: "Participants in user's agreement",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Participant list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          { name: "fromCurrency", in: "query", schema: { type: "string" } },
          { name: "toCurrency", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Rate list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["FX Rates"],
        summary: "Create FX rate oracle contract (operator)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateFxRateRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
          "200": { description: "Refreshed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateFxRateRequest" } } },
        },
        responses: {
          "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
          { name: "status", in: "query", schema: { type: "string", description: "Use REJECTED for archived obligations" } },
          { name: "role", in: "query", schema: { type: "string", enum: ["payer", "receiver"] } },
          { name: "currency", in: "query", schema: { type: "string" } },
          { name: "agreementId", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": { description: "Paginated obligations", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Obligations"],
        summary: "Create obligation",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateObligationRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          "200": { description: "Obligation", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          "200": { description: "Accepted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/RejectObligationRequest" } } },
        },
        responses: {
          "200": { description: "Rejected", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/cycles": {
      get: {
        tags: ["Cycles"],
        summary: "List netting cycles",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "agreementId", in: "query", schema: { type: "string" } }],
        responses: {
          "200": { description: "Cycle list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Cycles"],
        summary: "Start netting cycle (operator)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/StartCycleRequest" } } },
        },
        responses: {
          "201": { description: "Started", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/cycles/{contractId}": {
      get: {
        tags: ["Cycles"],
        summary: "Get cycle by contract ID",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Cycle", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/cycles/{contractId}/add-obligations": {
      post: {
        tags: ["Cycles"],
        summary: "Add accepted obligations to cycle (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Obligations added", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/ComputeCycleRequest" } } },
        },
        responses: {
          "200": { description: "Positions computed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          "200": { description: "Settled", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/cycles/{contractId}/force-settle": {
      post: {
        tags: ["Cycles"],
        summary: "Force settle cycle (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Force settled", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          "200": { description: "Closed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          { name: "cycleId", in: "query", schema: { type: "string" } },
          { name: "agreementId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Position list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
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
          "200": { description: "Acknowledged", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/instructions": {
      get: {
        tags: ["Settlement"],
        summary: "List settlement instructions",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "agreementId", in: "query", schema: { type: "string" } }],
        responses: {
          "200": { description: "Instruction list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/accounts": {
      get: {
        tags: ["Settlement"],
        summary: "List cash accounts",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Account list", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/settlement/{contractId}/execute": {
      post: {
        tags: ["Settlement"],
        summary: "Execute settlement instruction (operator)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Executed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/settlement/{contractId}/confirm": {
      post: {
        tags: ["Settlement"],
        summary: "Confirm settlement (participant)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "contractId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Confirmed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/operator/fund-account": {
      post: {
        tags: ["Operator"],
        summary: "Fund a participant cash account (operator)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/FundAccountRequest" } } },
        },
        responses: {
          "200": { description: "Funded", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
  },
} as const;
