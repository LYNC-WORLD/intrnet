const partyId = { type: "string", description: "Canton party ID (hint::fingerprint)" } as const;
const contractId = { type: "string", description: "Ledger contract ID" } as const;
const dateTime = { type: "string", format: "date-time" } as const;
const dateOnly = { type: "string", format: "date" } as const;

export const openApiComponents = {
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

    // --- Envelopes ---
    ApiSuccessEnvelope: {
      type: "object",
      properties: { success: { type: "boolean", example: true } },
      required: ["success"],
    },
    HealthResponse: {
      type: "object",
      properties: { ok: { type: "boolean", example: true } },
      required: ["ok"],
    },

    // --- Auth & users ---
    UserProfile: {
      type: "object",
      description: "App user profile returned after login or from /me",
      properties: {
        id: { type: "string" },
        email: { type: "string", format: "email" },
        partyId: { ...partyId, nullable: true, description: "Set after onboarding approval (optional until approved)" },
        agreementId: { type: "string", nullable: true },
        agreementContractId: {
          type: "string",
          nullable: true,
          description: "Latest active NettingAgreement contract id (may change after AddParticipant)",
        },
        role: { type: "string", enum: ["operator", "participant"] },
        companyName: { type: "string", nullable: true },
        status: { type: "string", enum: ["PENDING", "ACTIVE", "REJECTED"] },
        onboardingState: {
          type: "string",
          nullable: true,
          enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"],
          description: "Onboarding request state; null if no request exists",
        },
      },
      required: ["id", "email", "role", "status"],
    },
    UserProfileExtended: {
      allOf: [
        { $ref: "#/components/schemas/UserProfile" },
        {
          type: "object",
          properties: {
            oauthSub: { type: "string", nullable: true },
            onboardingRequest: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string" },
                state: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] },
              },
              required: ["id", "state"],
            },
          },
        },
      ],
    },
    OAuthLoginData: {
      type: "object",
      properties: {
        isNewUser: { type: "boolean" },
        user: { $ref: "#/components/schemas/UserProfile" },
      },
      required: ["isNewUser", "user"],
    },
    OAuthLoginResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/OAuthLoginData" } },
          required: ["data"],
        },
      ],
    },
    MeResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/UserProfileExtended" } },
          required: ["data"],
        },
      ],
    },

    // --- Onboarding ---
    OnboardingRequest: {
      type: "object",
      properties: {
        id: { type: "string" },
        userId: { type: "string" },
        companyName: { type: "string" },
        contactName: { type: "string", nullable: true },
        phone: { type: "string", nullable: true },
        country: { type: "string", nullable: true },
        partyHint: { type: "string", nullable: true },
        state: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] },
        createdAt: dateTime,
        updatedAt: dateTime,
      },
      required: ["id", "userId", "companyName", "state", "createdAt", "updatedAt"],
    },
    OnboardingRequestWithUser: {
      allOf: [
        { $ref: "#/components/schemas/OnboardingRequest" },
        {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                status: { type: "string", enum: ["PENDING", "ACTIVE", "REJECTED"] },
                role: { type: "string" },
                oauthSub: { type: "string", nullable: true },
                companyName: { type: "string", nullable: true },
                partyId: { ...partyId, nullable: true },
                agreementId: { type: "string", nullable: true },
                ledgerUserId: { type: "string", nullable: true },
              },
              required: ["id", "email", "status", "role"],
            },
          },
          required: ["user"],
        },
      ],
    },
    ApproveOnboardingResult: {
      type: "object",
      properties: {
        id: { type: "string" },
        email: { type: "string" },
        companyName: { type: "string", nullable: true },
        role: { type: "string" },
        partyId: partyId,
        ledgerUserId: { type: "string" },
        agreementId: { type: "string", nullable: true },
        status: { type: "string", enum: ["ACTIVE"] },
      },
      required: ["id", "email", "role", "partyId", "ledgerUserId", "status"],
    },
    RejectOnboardingResult: {
      type: "object",
      properties: {
        requestId: { type: "string" },
        status: { type: "string", enum: ["REJECTED"] },
        reason: { type: "string" },
      },
      required: ["requestId", "status", "reason"],
    },
    CompanySummary: {
      type: "object",
      properties: {
        id: { type: "string" },
        email: { type: "string" },
        companyName: { type: "string", nullable: true },
        partyId: { ...partyId, nullable: true },
        ledgerUserId: { type: "string", nullable: true },
        agreementId: { type: "string", nullable: true },
        status: { type: "string", enum: ["ACTIVE"] },
        createdAt: dateTime,
      },
      required: ["id", "email", "status", "createdAt"],
    },
    LedgerParty: {
      type: "object",
      properties: {
        party: partyId,
        isLocal: { type: "boolean" },
      },
      required: ["party", "isLocal"],
    },
    ParticipantSummary: {
      type: "object",
      properties: {
        partyId: { ...partyId, nullable: true },
        companyName: { type: "string", nullable: true },
        email: { type: "string" },
        status: { type: "string", enum: ["PENDING", "ACTIVE", "REJECTED"] },
      },
      required: ["email", "status"],
    },

    // --- Ledger primitives ---
    LedgerContractCreate: {
      type: "object",
      description: "Result of a ledger contract create",
      properties: {
        contractId,
        payload: { type: "object", additionalProperties: true },
      },
      required: ["contractId", "payload"],
    },
    LedgerExerciseResult: {
      type: "object",
      description: "Result of a ledger choice exercise",
      properties: {
        newContractId: {
          ...contractId,
          nullable: true,
          description: "Present when the choice recreates the contract with a new contract id",
        },
        exerciseResult: { description: "Choice return value (shape varies by choice)" },
        events: { type: "array", items: { type: "object", additionalProperties: true } },
      },
      required: ["events"],
    },
    NewContractIdResult: {
      type: "object",
      properties: { newContractId: contractId },
      required: ["newContractId"],
    },

    // --- Agreements ---
    Agreement: {
      type: "object",
      properties: {
        contractId,
        agreementId: { type: "string" },
        operator: partyId,
        participants: { type: "array", items: partyId },
        settlementCurrency: { type: "string" },
        agreementDate: dateTime,
      },
      required: ["contractId", "agreementId", "operator", "participants", "settlementCurrency", "agreementDate"],
    },
    AgreementDetail: {
      type: "object",
      description: "Ledger agreement payload plus contractId",
      properties: {
        contractId,
        agreementId: { type: "string" },
        operator: partyId,
        participants: { type: "array", items: partyId },
        settlementCurrency: { type: "string" },
        agreementDate: { oneOf: [{ type: "string" }, dateOnly] },
        fxOracleParty: { ...partyId, description: "Optional on ledger payload" },
      },
      required: ["contractId"],
    },

    // --- FX ---
    FxRate: {
      type: "object",
      properties: {
        contractId,
        fromCurrency: { type: "string" },
        toCurrency: { type: "string" },
        rate: { type: "number" },
        asOf: dateTime,
      },
      required: ["contractId", "fromCurrency", "toCurrency", "rate", "asOf"],
    },

    // --- Obligations ---
    Obligation: {
      type: "object",
      properties: {
        contractId,
        payer: partyId,
        receiver: partyId,
        amount: { type: "number" },
        currency: { type: "string" },
        description: { type: "string" },
        invoiceRef: { type: "string" },
        agreementId: { type: "string" },
        status: { type: "string", enum: ["PENDING", "ACCEPTED", "NETTED", "REJECTED"] },
        createdAt: dateTime,
        archivedAt: { ...dateTime, nullable: true, description: "Set when obligation was archived/rejected" },
      },
      required: [
        "contractId",
        "payer",
        "receiver",
        "amount",
        "currency",
        "description",
        "invoiceRef",
        "agreementId",
        "status",
        "createdAt",
      ],
    },
    ObligationListData: {
      type: "object",
      properties: {
        obligations: { type: "array", items: { $ref: "#/components/schemas/Obligation" } },
        total: { type: "integer" },
        page: { type: "integer" },
      },
      required: ["obligations", "total", "page"],
    },

    // --- Cycles ---
    InstructionCounts: {
      type: "object",
      properties: {
        PENDING: { type: "integer" },
        EXECUTED: { type: "integer" },
        CONFIRMED: { type: "integer" },
      },
      required: ["PENDING", "EXECUTED", "CONFIRMED"],
    },
    CycleGateSummary: {
      type: "object",
      description: "Derived workflow flags for operator UI",
      properties: {
        pendingAckCount: { type: "integer" },
        instructionCounts: { $ref: "#/components/schemas/InstructionCounts" },
        canSettle: { type: "boolean" },
        canForceSettle: { type: "boolean" },
        canClose: { type: "boolean" },
      },
      required: [
        "pendingAckCount",
        "instructionCounts",
        "canSettle",
        "canForceSettle",
        "canClose",
      ],
    },
    NettingCycle: {
      type: "object",
      properties: {
        contractId,
        cycleId: { type: "string" },
        operator: partyId,
        settlementCurrency: { type: "string" },
        status: { type: "string", enum: ["OPEN", "CLOSED"] },
        cutoffTime: dateTime,
        agreementId: { type: "string" },
        obligationCids: {
          type: "array",
          items: contractId,
          description: "Obligation contract ids added to this cycle (ACCEPTED until compute, then NETTED)",
        },
        ackDeadline: { ...dateTime, nullable: true, description: "Set after compute (optional before compute)" },
        positionCids: { type: "array", items: contractId, description: "Empty until compute is called" },
        settlementInstructionCids: {
          type: "array",
          items: contractId,
          description: "Empty until settle is called",
        },
        settlementPhase: { type: "string", enum: ["NOT_SETTLED", "SETTLED"] },
        forceSettled: { type: "boolean" },
        settledAt: { ...dateTime, nullable: true },
        createdAt: dateTime,
      },
      required: [
        "contractId",
        "cycleId",
        "operator",
        "settlementCurrency",
        "status",
        "cutoffTime",
        "agreementId",
        "obligationCids",
        "positionCids",
        "settlementInstructionCids",
        "settlementPhase",
        "forceSettled",
        "createdAt",
      ],
    },
    NettingCycleDetail: {
      allOf: [
        { $ref: "#/components/schemas/NettingCycle" },
        { $ref: "#/components/schemas/CycleGateSummary" },
      ],
    },

    // --- Positions & settlement ---
    NetPosition: {
      type: "object",
      properties: {
        contractId,
        participant: partyId,
        cycleId: { type: "string" },
        netAmountSettlement: { type: "number" },
        settlementCurrency: { type: "string" },
        status: { type: "string", enum: ["PENDING", "ACKNOWLEDGED"] },
      },
      required: [
        "contractId",
        "participant",
        "cycleId",
        "netAmountSettlement",
        "settlementCurrency",
        "status",
      ],
    },
    SettlementInstruction: {
      type: "object",
      properties: {
        contractId,
        payer: partyId,
        receiver: partyId,
        amount: { type: "number" },
        currency: { type: "string" },
        cycleId: { type: "string" },
        status: { type: "string", enum: ["PENDING", "EXECUTED", "CONFIRMED", "FAILED"] },
        paymentReference: { type: "string", nullable: true },
        failureReason: { type: "string", nullable: true },
        createdAt: dateTime,
      },
      required: ["contractId", "payer", "receiver", "amount", "currency", "cycleId", "status", "createdAt"],
    },
    PartyBalance: {
      type: "object",
      properties: {
        partyId,
        currency: { type: "string" },
        available: { type: "number" },
        reserved: { type: "number" },
        total: { type: "number" },
        holdingsTotal: { type: "number", nullable: true },
      },
      required: ["partyId", "currency", "available", "reserved", "total"],
    },
    FailSettlementRequest: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Optional human-readable failure reason" },
      },
    },

    // --- Admin / infra ---
    PqsHealth: {
      type: "object",
      properties: {
        connected: { type: "boolean" },
        agreementCount: { type: "integer" },
        cycleCount: { type: "integer" },
        obligationCount: { type: "integer" },
        settlementInstructionCount: { type: "integer" },
        packageId: { type: "string", description: "Present when connected (optional on error)" },
        error: { type: "string", description: "Present when connected is false (optional on success)" },
      },
      required: ["connected", "agreementCount", "cycleCount", "obligationCount", "settlementInstructionCount"],
    },

    // --- Requests ---
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
        contactName: { type: "string", description: "Optional" },
        phone: { type: "string", description: "Optional" },
        country: { type: "string", description: "Optional" },
        partyHint: { type: "string", description: "Optional slug for Canton party allocation" },
      },
      required: ["email", "companyName"],
    },
    ApproveOnboardingRequest: {
      type: "object",
      description: "All fields optional; agreement resolved from request or body",
      properties: {
        partyHint: { type: "string", description: "Optional; defaults to request partyHint or company slug" },
        agreementId: { type: "string", description: "Optional if request user already has agreementId" },
        agreementContractId: { type: "string", description: "Optional alternative to agreementId" },
      },
    },
    RejectOnboardingRequest: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
    ManualBalanceCreditRequest: {
      type: "object",
      description:
        "Operator manual tUSD balance credit when automatic deposit sync cannot attribute a custody holding. " +
        "Prefer holdingContractId (idempotent with deposit sync); otherwise supply a unique referenceId.",
      properties: {
        partyId: { ...partyId, description: "ACTIVE participant party to credit" },
        amount: { type: "number", exclusiveMinimum: 0 },
        holdingContractId: {
          type: "string",
          description: "Optional custody Holding contract id; credits with DEPOSIT reference (sync-safe)",
        },
        referenceId: {
          type: "string",
          description: "Required when holdingContractId is omitted; idempotency key for MANUAL_CREDIT",
        },
        note: { type: "string", description: "Optional audit note" },
      },
      required: ["partyId", "amount"],
    },
    CreateAgreementRequest: {
      type: "object",
      properties: {
        agreementId: { type: "string" },
        settlementCurrency: { type: "string", default: "tUSD", description: "Optional; defaults to SETTLEMENT_CURRENCY env" },
        agreementDate: { ...dateOnly, description: "Optional; defaults to today" },
      },
      required: ["agreementId"],
    },
    CreateFxRateRequest: {
      type: "object",
      properties: {
        fromCurrency: { type: "string" },
        toCurrency: { type: "string" },
        rate: { type: "number" },
        asOf: { ...dateTime, description: "Optional; defaults to now" },
      },
      required: ["fromCurrency", "toCurrency", "rate"],
    },
    UpdateFxRateRequest: {
      type: "object",
      properties: {
        rate: { type: "number" },
        asOf: { ...dateTime, description: "Optional; defaults to now" },
      },
      required: ["rate"],
    },
    CreateObligationRequest: {
      type: "object",
      properties: {
        receiver: { ...partyId, description: "Receiver party ID (required)" },
        amount: { type: "string", description: "Decimal amount as string" },
        currency: { type: "string" },
        description: { type: "string", description: "Optional" },
        invoiceRef: { type: "string", description: "Optional" },
        agreementId: { type: "string", description: "Optional for participants (auto-scoped); required for operator" },
      },
      required: ["receiver", "amount", "currency"],
    },
    RejectObligationRequest: {
      type: "object",
      description: "Body optional; reason defaults to empty string",
      properties: { reason: { type: "string", description: "Optional rejection reason" } },
    },
    StartCycleRequest: {
      type: "object",
      properties: {
        cycleId: { type: "string" },
        cutoffTime: dateTime,
        agreementId: { type: "string" },
        agreementContractId: { type: "string", description: "Optional alternative to agreementId" },
      },
      required: ["cycleId", "cutoffTime", "agreementId"],
    },
    StartCycleResult: {
      type: "object",
      description:
        "StartNettingCycle is nonconsuming; the agreement contract id is unchanged. Use newContractId for the created cycle.",
      properties: {
        newContractId: contractId,
        cycleContractId: contractId,
        exerciseResult: { description: "Ledger ContractId NettingCycle" },
        events: { type: "array", items: { type: "object", additionalProperties: true } },
      },
      required: ["newContractId", "cycleContractId", "events"],
    },
    StartCycleResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/StartCycleResult" } },
          required: ["data"],
        },
      ],
    },
    ComputeCycleRequest: {
      type: "object",
      description: "Body optional",
      properties: {
        ackDeadline: {
          ...dateTime,
          description: "Optional; defaults to cycle cutoffTime",
        },
      },
    },
    // --- Typed success responses (success + data) ---
    OnboardingSubmitResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/OnboardingRequest" } },
          required: ["data"],
        },
      ],
    },
    AgreementListResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Agreement" } },
          },
          required: ["data"],
        },
      ],
    },
    AgreementResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/Agreement" } },
          required: ["data"],
        },
      ],
    },
    AgreementDetailResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/AgreementDetail" } },
          required: ["data"],
        },
      ],
    },
    ObligationListResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/ObligationListData" } },
          required: ["data"],
        },
      ],
    },
    ObligationResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/Obligation" } },
          required: ["data"],
        },
      ],
    },
    CycleListResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/NettingCycle" } },
          },
          required: ["data"],
        },
      ],
    },
    CycleDetailResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/NettingCycleDetail" } },
          required: ["data"],
        },
      ],
    },
    LedgerExerciseResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/LedgerExerciseResult" } },
          required: ["data"],
        },
      ],
    },
    LedgerContractCreateResponse: {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/LedgerContractCreate" } },
          required: ["data"],
        },
      ],
    },
    PqsHealthResponse: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: { $ref: "#/components/schemas/PqsHealth" },
      },
      required: ["success", "data"],
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
    BadRequest: {
      description: "Validation error",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    },
    Conflict: {
      description: "Ledger conflict or business rule violation",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    },
  },
} as const;

function listResponse(itemRef: string) {
  return {
    allOf: [
      { $ref: "#/components/schemas/ApiSuccessEnvelope" },
      {
        type: "object",
        properties: { data: { type: "array", items: { $ref: itemRef } } },
        required: ["data"],
      },
    ],
  };
}

function itemResponse(itemRef: string) {
  return {
    allOf: [
      { $ref: "#/components/schemas/ApiSuccessEnvelope" },
      {
        type: "object",
        properties: { data: { $ref: itemRef } },
        required: ["data"],
      },
    ],
  };
}

export const routeResponseSchemas = {
  companyList: listResponse("#/components/schemas/CompanySummary"),
  partyList: listResponse("#/components/schemas/LedgerParty"),
  onboardingRequestList: listResponse("#/components/schemas/OnboardingRequestWithUser"),
  onboardingRequestDetail: itemResponse("#/components/schemas/OnboardingRequestWithUser"),
  approveOnboarding: itemResponse("#/components/schemas/ApproveOnboardingResult"),
  rejectOnboarding: itemResponse("#/components/schemas/RejectOnboardingResult"),
  participantList: listResponse("#/components/schemas/ParticipantSummary"),
  fxRateList: listResponse("#/components/schemas/FxRate"),
  positionList: listResponse("#/components/schemas/NetPosition"),
  settlementInstructionList: listResponse("#/components/schemas/SettlementInstruction"),
  partyBalance: itemResponse("#/components/schemas/PartyBalance"),
  partyBalanceList: listResponse("#/components/schemas/PartyBalance"),
  newContractId: itemResponse("#/components/schemas/NewContractIdResult"),
} as const;
