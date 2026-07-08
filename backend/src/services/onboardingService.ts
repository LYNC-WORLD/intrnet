import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import { ValidatorCantonAdapter } from "../canton/validatorAdapter";
import { slugify } from "../utils/crypto";
import { isServiceError } from "../utils/http";
import {
  resolveAgreementFromInput,
  upsertAgreementFromLedger,
} from "./agreementsService";

export interface OnboardingFormInput {
  email: string;
  companyName: string;
  contactName?: string;
  phone?: string;
  country?: string;
  partyHint?: string;
  referenceEmail?: string;
}

export interface ApproveOnboardingInput {
  requestId: string;
  approverUserId: string;
  partyHint?: string;
  agreementId?: string;
  agreementContractId?: string;
  initialBalance?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("A valid email is required");

  const emailTaken = await prisma.user.findFirst({
    where: { email, NOT: { id: userId } },
  });
  if (emailTaken) throw new Error("Email is already linked to another account");

  // reference email and agreementId
  const referenceEmail = input.referenceEmail;
  let referenceData;
  if(referenceEmail){
    referenceData = await prisma.user.findUnique({
      select: {agreementId: true},
      where: {
        email: referenceEmail,
      }
    })
  }

  await prisma.user.update({
    where: { id: userId },
    data: { email },
  });

  return prisma.onboardingRequest.upsert({
    where: { userId },
    update: {
      companyName: input.companyName,
      contactName: input.contactName,
      phone: input.phone,
      country: input.country,
      partyHint: input.partyHint,
      state: "SUBMITTED",
      referenceEmail: referenceEmail,
      referenceAgreementId: referenceData?.agreementId,
    },
    create: {
      userId,
      companyName: input.companyName,
      contactName: input.contactName,
      phone: input.phone,
      country: input.country,
      partyHint: input.partyHint,
      state: "SUBMITTED",
      referenceEmail: referenceEmail,
      referenceAgreementId: referenceData?.agreementId,
    },
  });
}

export async function verifyOnboardEmail(email: string) {
  if (!isValidEmail(email)) throw new Error("A valid email is required");

  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (!user) throw new Error("Email not registered");
  if (user.status === "ACTIVE" && user.role == "participant") {
    return {
      success: true,
      message: `Email found, ${email} is whitelisted`,
    };
  }
  else{
    throw new Error("Email not registered");
  }
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

  const hint = slugify(
    input.partyHint || request.partyHint || request.companyName,
  );
  if (!hint) throw new Error("partyHint/companyName must produce a valid slug");

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
  const { agreementId, agreementContractId } = agreementResolution.data;

  const client = await operatorClient();
  const agreement = await client.fetchById(agreementContractId);
  if (!agreement) throw new Error("NettingAgreement not found on ledger");

  const participants = (agreement.payload.participants as string[]) ?? [];
  if (!participants.includes(partyId)) {
    const result = await client.exercise({
      templateId: T.NettingAgreement,
      contractId: agreementContractId,
      choice: "AddParticipant",
      argument: { newParticipant: partyId },
    });

    const created = (
      result.events as Array<{
        created?: { contractId: string; payload?: Record<string, unknown> };
      }>
    ).find((event) => event.created);
    if (created?.created?.contractId && created.created.payload) {
      await upsertAgreementFromLedger(created.created.contractId, {
        agreementId: created.created.payload.agreementId as string | undefined,
        operator: created.created.payload.operator as string | undefined,
        settlementCurrency: created.created.payload.settlementCurrency as
          | string
          | undefined,
        participants: created.created.payload.participants as
          | string[]
          | undefined,
        agreementDate: created.created.payload.agreementDate as
          | string
          | undefined,
      });
    }
  }

  const operatorPartyId = await getOperatorPartyId();
  const currency = process.env.APP_DEFAULT_CURRENCY ?? "USD";
  const existingAccount = (await client.query(T.CashAccount)).find(
    (account) =>
      account.payload.owner === partyId &&
      account.payload.currency === currency,
  );
  if (!existingAccount) {
    await client.create({
      templateId: T.CashAccount,
      payload: {
        owner: partyId,
        currency,
        balance:
          input.initialBalance ??
          String(process.env.ONBOARDING_INITIAL_BALANCE ?? "0"),
        operator: operatorPartyId,
      },
    });
  }

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
}

export async function rejectOnboardingRequest(
  requestId: string,
  approverUserId: string,
  reason: string,
) {
  const request = await prisma.onboardingRequest.findUnique({
    where: { id: requestId },
    select: { id: true, userId: true },
  });
  if (!request) throw new Error("Onboarding request not found");

  await prisma.onboardingRequest.update({
    where: { id: requestId },
    data: {
      state: "REJECTED",
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
