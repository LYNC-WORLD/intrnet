import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import {
  inferActorPartyId,
  inferCycleId,
  mapCreatedEventType,
  recordAuditEvent,
} from "./auditService";
import { upsertAgreementFromLedger } from "./agreementsService";

type LedgerEvent = {
  created?: {
    contractId: string;
    templateId: string;
    payload: Record<string, any>;
  };
  archived?: {
    contractId: string;
    templateId: string;
  };
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export async function startEventProcessor() {
  const client = await operatorClient();
  const stream = await client.stream(
    Object.values(T),
    handleEvents,
    (err) => console.warn("[EventProcessor]", err.message),
  );
  console.log("[EventProcessor] streaming ledger events...");
  return stream;
}

async function handleEvents(events: unknown[]) {
  for (const event of events as LedgerEvent[]) {
    if (event.created) await onCreated(event.created).catch(console.error);
    if (event.archived) await onArchived(event.archived).catch(console.error);
  }
}

async function onCreated(event: LedgerEvent["created"]) {
  if (!event) return;
  const { contractId, templateId, payload: p } = event;

  if (templateId.includes("Obligation")) {
    await prisma.obligation.upsert({
      where: { contractId },
      create: {
        contractId,
        payer: p.payer,
        receiver: p.receiver,
        amount: parseFloat(p.amount),
        currency: p.currency,
        description: p.description,
        invoiceRef: p.invoiceRef,
        agreementId: p.agreementId,
        status: p.status,
        createdAt: new Date(p.createdAt),
      },
      update: { status: p.status },
    });
  }

  if (templateId.includes("NettingCycle")) {
    const settlementPhase = String(p.settlementPhase ?? "NOT_SETTLED");
    const settledAt = settlementPhase === "SETTLED" ? new Date() : null;
    await prisma.nettingCycle.upsert({
      where: { cycleId: p.cycleId },
      create: {
        contractId,
        cycleId: p.cycleId,
        operator: p.operator,
        settlementCurrency: p.settlementCurrency,
        status: p.status,
        cutoffTime: new Date(p.cutoffTime),
        agreementId: p.agreementId,
        ackDeadline: p.ackDeadline ? new Date(p.ackDeadline) : null,
        positionContractIds: asStringArray(p.positionCids),
        settlementInstructionContractIds: asStringArray(p.settlementInstructionCids),
        settlementPhase,
        forceSettled: Boolean(p.forceSettled),
        settledAt,
      },
      update: {
        contractId,
        status: p.status,
        cutoffTime: new Date(p.cutoffTime),
        ackDeadline: p.ackDeadline ? new Date(p.ackDeadline) : null,
        positionContractIds: asStringArray(p.positionCids),
        settlementInstructionContractIds: asStringArray(p.settlementInstructionCids),
        settlementPhase,
        forceSettled: Boolean(p.forceSettled),
        settledAt,
      },
    });

    if (Boolean(p.forceSettled)) {
      await recordAuditEvent({
        eventType: "Cycle Force Settled",
        actorPartyId: p.operator,
        contractId,
        templateId,
        payload: p,
        cycleId: p.cycleId,
      });
    }
  }

  if (templateId.includes("NettingAgreement")) {
    await upsertAgreementFromLedger(contractId, {
      agreementId: p.agreementId,
      operator: p.operator,
      settlementCurrency: p.settlementCurrency,
      participants: p.participants as string[] | undefined,
      agreementDate: p.agreementDate,
    });
  }

  if (templateId.includes("NetPosition")) {
    await prisma.netPosition.upsert({
      where: { contractId },
      create: {
        contractId,
        participant: p.participant,
        cycleId: p.cycleId,
        netAmountSettlement: parseFloat(p.netAmountSettlement),
        settlementCurrency: p.settlementCurrency,
        status: p.status,
      },
      update: { status: p.status },
    });
  }

  if (templateId.includes("SettlementInstruction")) {
    await prisma.settlementInstruction.upsert({
      where: { contractId },
      create: {
        contractId,
        payer: p.payer,
        receiver: p.receiver,
        amount: parseFloat(p.amount),
        currency: p.currency,
        cycleId: p.cycleId,
        status: p.status,
        failureReason: p.failureReason ? String(p.failureReason) : null,
      },
      update: {
        status: p.status,
        failureReason: p.failureReason ? String(p.failureReason) : null,
      },
    });
  }

  if (templateId.includes("FxRateOracle")) {
    await prisma.fxRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: p.fromCurrency,
          toCurrency: p.toCurrency,
        },
      },
      create: {
        contractId,
        fromCurrency: p.fromCurrency,
        toCurrency: p.toCurrency,
        rate: parseFloat(p.rate),
        asOf: new Date(p.asOf),
      },
      update: {
        contractId,
        rate: parseFloat(p.rate),
        asOf: new Date(p.asOf),
      },
    });
    await prisma.fxRateHistory.create({
      data: {
        contractId,
        fromCurrency: p.fromCurrency,
        toCurrency: p.toCurrency,
        rate: parseFloat(p.rate),
        asOf: new Date(p.asOf),
      },
    });
  }

  if (templateId.includes("CashAccount")) {
    await prisma.cashAccount.upsert({
      where: { contractId },
      create: {
        contractId,
        owner: p.owner,
        currency: p.currency,
        balance: parseFloat(p.balance),
      },
      update: {
        balance: parseFloat(p.balance),
      },
    });
  }

  await recordAuditEvent({
    eventType: mapCreatedEventType(templateId, p),
    actorPartyId: inferActorPartyId(templateId, p),
    contractId,
    templateId,
    payload: p,
    cycleId: inferCycleId(templateId, p),
    timestamp: p.createdAt ? new Date(p.createdAt) : undefined,
  });
}

async function onArchived(event: LedgerEvent["archived"]) {
  if (!event) return;
  const { contractId, templateId } = event;
  await prisma.obligation.updateMany({
    where: { contractId, status: "PENDING" },
    data: { status: "REJECTED" },
  });
  await prisma.netPosition.updateMany({
    where: { contractId },
    data: { status: "ARCHIVED" },
  });
  await prisma.settlementInstruction.updateMany({
    where: { contractId },
    data: { status: "ARCHIVED" },
  });

  if (templateId.includes("Obligation")) {
    await recordAuditEvent({
      eventType: "Obligation Rejected",
      contractId,
      templateId,
      payload: { contractId },
    });
  }
}
