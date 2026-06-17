import bcrypt from "bcrypt";
import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import { getCantonAdapter } from "../canton";
import { generateTemporaryPassword, slugify } from "../utils/crypto";
import { isServiceError } from "../utils/http";
import { resolveAgreementFromInput, upsertAgreementFromLedger } from "./agreementsService";

export interface OnboardCompanyInput {
  companyName: string;
  email: string;
  partyHint: string;
  agreementId?: string;
  agreementContractId?: string;
  initialPassword?: string;
}

export async function onboardCompany(input: OnboardCompanyInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error("Email already exists");

  const hint = slugify(input.partyHint || input.companyName);
  if (!hint) throw new Error("partyHint/companyName must produce a valid slug");

  const adapter = getCantonAdapter();
  const { partyId } = await adapter.allocateParty(hint);

  const ledgerUserId = `netclear-${hint}`;
  await adapter.createLedgerUser({ userId: ledgerUserId, partyId });
  const partyToken = await adapter.mintPartyToken({ userId: ledgerUserId, partyId });

  const agreementResolution = await resolveAgreementFromInput({
    agreementId: input.agreementId,
    agreementContractId: input.agreementContractId,
  });
  if (isServiceError(agreementResolution)) {
    throw new Error(agreementResolution.error);
  }
  const { agreementId, agreementContractId } = agreementResolution.data;

  const client = operatorClient();
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

    const created = (result.events as Array<{ created?: { contractId: string; payload?: Record<string, unknown> } }>).find(
      (event) => event.created,
    );
    if (created?.created?.contractId && created.created.payload) {
      await upsertAgreementFromLedger(created.created.contractId, {
        agreementId: created.created.payload.agreementId as string | undefined,
        operator: created.created.payload.operator as string | undefined,
        settlementCurrency: created.created.payload.settlementCurrency as string | undefined,
        participants: created.created.payload.participants as string[] | undefined,
        agreementDate: created.created.payload.agreementDate as string | undefined,
      });
    }
  }

  const operatorPartyId = await getOperatorPartyId();
  const currency = process.env.APP_DEFAULT_CURRENCY ?? "USD";
  const existingAccount = (await client.query(T.CashAccount)).find(
    (account) => account.payload.owner === partyId && account.payload.currency === currency,
  );
  if (!existingAccount) {
    await client.create({
      templateId: T.CashAccount,
      payload: {
        owner: partyId,
        currency,
        balance: String(process.env.ONBOARDING_INITIAL_BALANCE ?? "0"),
        operator: operatorPartyId,
      },
    });
  }

  const temporaryPassword = input.initialPassword || generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      partyId,
      ledgerUserId,
      partyToken,
      agreementId,
      agreementContractId,
      role: "participant",
      companyName: input.companyName,
      status: "ACTIVE",
    },
  });

  return {
    id: user.id,
    email: user.email,
    companyName: user.companyName,
    role: user.role,
    partyId,
    ledgerUserId,
    agreementId: user.agreementId,
    temporaryPassword,
  };
}
