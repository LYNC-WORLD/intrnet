import { prisma } from "../db";
import { ValidatorCantonAdapter } from "../canton/validatorAdapter";
import { pqsHealthCheck } from "../repositories/pqsLedgerReadRepository";
import {
  approveAndProvisionUser,
  ApproveOnboardingInput,
  rejectOnboardingRequest,
} from "./onboardingService";

export { approveAndProvisionUser as approveOnboardingRequest, rejectOnboardingRequest as rejectRequest };
export type { ApproveOnboardingInput };

export async function listOnboardingRequests(status?: string) {
  return prisma.onboardingRequest.findMany({
    where: status ? { state: status } : undefined,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          role: true,
          oauthSub: true,
          companyName: true,
          partyId: true,
          agreementId: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getOnboardingRequest(id: string) {
  return prisma.onboardingRequest.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          role: true,
          oauthSub: true,
          companyName: true,
          partyId: true,
          agreementId: true,
          ledgerUserId: true,
        },
      },
    },
  });
}

export async function listCompanies(params: {
  agreementId?: string;
  page: number;
  limit: number;
}) {
  const where = {
    role: "participant" as const,
    status: "ACTIVE" as const,
    ...(params.agreementId ? { agreementId: params.agreementId } : {}),
  };
  const select = {
    id: true,
    email: true,
    companyName: true,
    partyId: true,
    ledgerUserId: true,
    agreementId: true,
    status: true,
    createdAt: true,
  };

  const [total, companies] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      select,
    }),
  ]);

  return { companies, total, page: params.page };
}

export async function listParties() {
  return new ValidatorCantonAdapter().listParties();
}

function shortenPartyId(partyId: string | null | undefined): string {
  if (!partyId) return "unknown";
  if (partyId.length <= 16) return partyId;
  return `${partyId.slice(0, 6)}...${partyId.slice(-6)}`;
}

function activityStatusFromEventType(eventType: string): string {
  const lower = eventType.toLowerCase();
  if (lower.includes("settled") || lower.includes("confirmed") || lower.includes("executed")) {
    return "Settled";
  }
  if (lower.includes("reject") || lower.includes("fail")) return "Failed";
  if (lower.includes("open") || lower.includes("created") || lower.includes("computed")) {
    return "Open";
  }
  return "Pending";
}

function mapAuditToActivity(event: {
  id: string;
  eventType: string;
  timestamp: Date;
  cycleId: string | null;
  contractId: string | null;
  payload: unknown;
}) {
  const payload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as Record<string, unknown>)
      : {};
  const agreementId =
    typeof payload.agreementId === "string" ? payload.agreementId : null;
  const title =
    event.cycleId ||
    (typeof payload.cycleId === "string" ? payload.cycleId : null) ||
    event.eventType;
  const descriptionParts = [
    agreementId,
    event.eventType !== title ? event.eventType : null,
  ].filter(Boolean);

  return {
    id: event.id,
    kind: "ledger" as const,
    title,
    description: descriptionParts.join(" · ") || event.eventType,
    status: activityStatusFromEventType(event.eventType),
    timestamp: event.timestamp.toISOString(),
  };
}

function mapOnboardingToActivity(request: {
  id: string;
  companyName: string;
  state: string;
  partyHint: string | null;
  updatedAt: Date;
  user: { partyId: string | null } | null;
}) {
  const status =
    request.state === "APPROVED"
      ? "Settled"
      : request.state === "REJECTED"
        ? "Failed"
        : "Pending";
  return {
    id: request.id,
    kind: "whitelist" as const,
    title: "Whitelist request",
    description: `${shortenPartyId(request.partyHint ?? request.user?.partyId)} submitted`,
    status,
    timestamp: request.updatedAt.toISOString(),
  };
}

export async function getDashboard(activityLimit = 10) {
  const limit = Math.min(Math.max(activityLimit, 1), 50);

  const [totalUsers, whitelistRequests, pqs, recentAudit, recentOnboarding] = await Promise.all([
    prisma.user.count(),
    prisma.onboardingRequest.count(),
    pqsHealthCheck(),
    prisma.auditEvent.findMany({
      orderBy: { timestamp: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        timestamp: true,
        cycleId: true,
        contractId: true,
        payload: true,
      },
    }),
    prisma.onboardingRequest.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        companyName: true,
        state: true,
        partyHint: true,
        updatedAt: true,
        user: { select: { partyId: true } },
      },
    }),
  ]);

  const recentActivity = [
    ...recentAudit.map(mapAuditToActivity),
    ...recentOnboarding.map(mapOnboardingToActivity),
  ]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit);

  return {
    summary: {
      totalUsers,
      whitelistRequests,
      cycles: pqs.cycleCount,
      totalAgreements: pqs.agreementCount,
      obligations: pqs.obligationCount,
    },
    recentActivity,
    updatedAt: new Date().toISOString(),
  };
}
