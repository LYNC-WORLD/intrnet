import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { ValidatorCantonAdapter } from "../canton/validatorAdapter";
import { slugify } from "../utils/crypto";
import { isServiceError } from "../utils/http";
import { resolveAgreementFromInput, syncUserAgreementContractId } from "./agreementsService";
import { getOrCreatePartyBalance } from "./balanceService";
import { auditLedgerExercise } from "./ledgerAudit";
import {
  extractRecreatedContractId,
  findCreatedEvent,
  partyInList,
} from "../ledger/v2";
import { pqs } from "../db/pqs";

export interface OnboardingFormInput {
  email: string;
  companyName: string;
  contactName?: string;
  phone?: string;
  country?: string;
  partyHint?: string;
}

export interface ApproveOnboardingInput {
  requestId: string;
  approverUserId: string;
  partyHint?: string;
  agreementId?: string;
  agreementContractId?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function pkg(): string {
  const id = process.env.INTRNET_PACKAGE_ID?.trim();
  if (!id) {
    throw new Error(
      "INTRNET_PACKAGE_ID is required for PQS contract reads (set to your deployed Intrnet package hash)",
    );
  }
  return id;
}

export async function submitOnboardingRequest(
  userId: string,
  input: OnboardingFormInput,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  if (user.role !== "participant")
    throw new Error("Operators cannot create onboarding requests");
  if (user.status === "ACTIVE") throw new Error("User is already approved");
  if (user.status === "REJECTED") {
    throw new Error("Rejected users cannot resubmit onboarding requests");
  }
  if (!user.oauthSub) {
    throw new Error("Complete OAuth sign-in before submitting onboarding");
  }

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("A valid email is required");

  const emailTaken = await prisma.user.findFirst({
    where: { email, NOT: { id: userId } },
  });
  if (emailTaken) throw new Error("Email is already linked to another account");

  await prisma.user.update({
    where: { id: userId },
    data: { email },
  });
  const onboardingUser = await prisma.onboardingRequest.upsert({
    where: { userId },
    update: {
      companyName: input.companyName,
      contactName: input.contactName,
      phone: input.phone,
      country: input.country,
      partyHint: input.partyHint,
      state: "SUBMITTED",
    },
    create: {
      userId,
      companyName: input.companyName,
      contactName: input.contactName,
      phone: input.phone,
      country: input.country,
      partyHint: input.partyHint,
      state: "SUBMITTED",
    },
  });
  await approveOnOldestAgreement(
    onboardingUser.id,
    userId,
    onboardingUser.partyHint || onboardingUser.companyName,
  );
  return onboardingUser;
}

async function approveOnOldestAgreement(
  requestId: string,
  approverUserId: string,
  partyHint: string,
) {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
       WHERE package_id = $2
       ORDER BY created_effective_at ASC
       LIMIT 1`,
    [T.NettingAgreement, packageId],
  );
  if (!rows.length) {
    throw new Error("No NettingAgreement found on ledger for auto-approval");
  }
  const row = rows[0] as { contract_id: string; payload: Record<string, unknown> };
  const agreementId = row.payload.agreementId as string;
  const agreementContractId = row.contract_id;
  await approveAndProvisionUser({
    requestId,
    approverUserId,
    partyHint,
    agreementId,
    agreementContractId,
  });
}

export async function approveAndProvisionUser(input: ApproveOnboardingInput) {
  const request = await prisma.onboardingRequest.findUnique({
    where: { id: input.requestId },
    include: { user: true },
  });
  if (!request) throw new Error("Onboarding request not found");
  if (request.state !== "SUBMITTED" && request.state !== "DRAFT") {
    throw new Error(`Request cannot be approved from state ${request.state}`);
  }

  const user = request.user;
  if (user.role !== "participant")
    throw new Error("Only participant requests can be approved");
  if (!user.oauthSub) throw new Error("User has no OAuth subject linked");

  const claimed = await prisma.onboardingRequest.updateMany({
    where: { id: input.requestId, state: { in: ["SUBMITTED", "DRAFT"] } },
    data: { state: "PROVISIONING" },
  });
  if (claimed.count === 0) {
    throw new Error(`Request cannot be approved from state ${request.state}`);
  }

  const hint = slugify(
    input.partyHint || request.partyHint || request.companyName,
  );
  if (!hint) throw new Error("partyHint/companyName must produce a valid slug");

  try {
    const adapter = new ValidatorCantonAdapter();
    const { partyId } = await adapter.allocateParty(hint);

    const ledgerUserId = user.oauthSub;
    await adapter.createLedgerUser({ userId: ledgerUserId, partyId });

    const agreementResolution = await resolveAgreementFromInput({
      agreementId: input.agreementId,
      agreementContractId: input.agreementContractId,
    });
    if (isServiceError(agreementResolution)) {
      throw new Error(agreementResolution.error);
    }
    const { agreementId } = agreementResolution.data;
    let { agreementContractId } = agreementResolution.data;

    const client = await operatorClient();
    const agreement = await client.fetchById(agreementContractId);
    if (!agreement) throw new Error("NettingAgreement not found on ledger");

    const participants = Array.isArray(agreement.payload.participants)
      ? (agreement.payload.participants as string[])
      : [];
    if (!partyInList(participants, partyId)) {
      const result = await client.exercise({
        templateId: T.NettingAgreement,
        contractId: agreementContractId,
        choice: "AddParticipant",
        argument: { newParticipant: partyId },
      });

      await auditLedgerExercise(
        T.NettingAgreement,
        "AddParticipant",
        agreementContractId,
        result.events,
        {
          argument: { newParticipant: partyId },
        },
      );

      const created =
        findCreatedEvent(
          result.events as Array<{
            created?: {
              contractId: string;
              templateId: string;
              payload: Record<string, unknown>;
            };
          }>,
          T.NettingAgreement,
        ) ?? null;
      const newContractId =
        extractRecreatedContractId(
          result.exerciseResult,
          result.events as Array<{
            created?: { contractId: string; templateId: string };
          }>,
          T.NettingAgreement,
        ) ??
        created?.contractId ??
        null;
      if (!newContractId) {
        throw new Error(
          "AddParticipant did not return a new NettingAgreement contract id",
        );
      }

      agreementContractId = newContractId;
      await syncUserAgreementContractId(agreementId, agreementContractId);
    }

    await getOrCreatePartyBalance(partyId, 0);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        companyName: request.companyName,
        partyId,
        ledgerUserId,
        agreementId,
        agreementContractId,
        status: "ACTIVE",
      },
    });

    await prisma.onboardingRequest.update({
      where: { id: request.id },
      data: {
        state: "APPROVED",
      },
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      companyName: updatedUser.companyName,
      role: updatedUser.role,
      partyId,
      ledgerUserId,
      agreementId: updatedUser.agreementId,
      status: updatedUser.status,
    };
  } catch (err) {
    await prisma.onboardingRequest.updateMany({
      where: { id: input.requestId, state: "PROVISIONING" },
      data: { state: "SUBMITTED" },
    });
    throw err;
  }
}

export async function rejectOnboardingRequest(
  requestId: string,
  approverUserId: string,
  reason: string,
) {
  const request = await prisma.onboardingRequest.findUnique({
    where: { id: requestId },
    select: { id: true, userId: true, state: true },
  });
  if (!request) throw new Error("Onboarding request not found");
  if (request.state !== "SUBMITTED" && request.state !== "DRAFT") {
    throw new Error(`Request cannot be rejected from state ${request.state}`);
  }

  await prisma.onboardingRequest.update({
    where: { id: requestId },
    data: {
      state: "REJECTED",
      rejectedBy: approverUserId,
      rejectionReason: reason,
      rejectedAt: new Date(),
    },
  });

  await prisma.user.update({
    where: { id: request.userId },
    data: {
      status: "REJECTED",
    },
  });

  return {
    requestId,
    status: "REJECTED",
    reason,
  };
}
