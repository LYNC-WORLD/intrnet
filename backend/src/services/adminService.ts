import { prisma } from "../db";
import { ValidatorCantonAdapter } from "../canton/validatorAdapter";
import { approveAndProvisionUser, ApproveOnboardingInput, rejectOnboardingRequest } from "./onboardingService";

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

export async function approveOnboardingRequest(input: ApproveOnboardingInput) {
  return approveAndProvisionUser(input);
}

export async function rejectRequest(requestId: string, approverUserId: string, reason: string) {
  return rejectOnboardingRequest(requestId, approverUserId, reason);
}

export async function listCompanies(agreementId?: string) {
  return prisma.user.findMany({
    where: { role: "participant", status: "ACTIVE", ...(agreementId ? { agreementId } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      companyName: true,
      partyId: true,
      ledgerUserId: true,
      agreementId: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function listParties() {
  return new ValidatorCantonAdapter().listParties();
}
