export const T = {
  FxRateOracle: "Intrnet.FxRateOracle:FxRateOracle",
  NettingAgreement: "Intrnet.NettingAgreement:NettingAgreement",
  Obligation: "Intrnet.Obligation:Obligation",
  NettingCycle: "Intrnet.NettingCycle:NettingCycle",
  NetPosition: "Intrnet.NetPosition:NetPosition",
  SettlementInstruction: "Intrnet.SettlementInstruction:SettlementInstruction",
  CashAccount: "Intrnet.CashAccount:CashAccount",
} as const;

function getIntrnetPackageName(): string {
  return process.env.INTRNET_PACKAGE_NAME?.trim() || "intrnet-contracts";
}

export function pqsTemplateRef(templateId: string): string {
  return `${getIntrnetPackageName()}:${templateId}`;
}
