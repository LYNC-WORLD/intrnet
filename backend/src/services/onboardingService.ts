import bcrypt from "bcrypt";
import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import { getCantonAdapter } from "../canton";
import { generateTemporaryPassword, slugify } from "../utils/crypto";

export interface OnboardCompanyInput {
  companyName: string;
  email: string;
  partyHint: string;
  agreementContractId: string;
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

  const client = operatorClient();
  const agreement = await client.fetchById(input.agreementContractId);
  if (!agreement) throw new Error("NettingAgreement not found on ledger");

  const participants = (agreement.payload.participants as string[]) ?? [];
  if (!participants.includes(partyId)) {
    await client.exercise({
      templateId: T.NettingAgreement,
      contractId: input.agreementContractId,
      choice: "AddParticipant",
      argument: { newParticipant: partyId },
    });
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
    temporaryPassword,
  };
}
