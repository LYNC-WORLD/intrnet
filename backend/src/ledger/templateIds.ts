export const T = {
  FxRateOracle: "Intrnet.FxRateOracle:FxRateOracle",
  NettingAgreement: "Intrnet.NettingAgreement:NettingAgreement",
  Obligation: "Intrnet.Obligation:Obligation",
  NettingCycle: "Intrnet.NettingCycle:NettingCycle",
  NetPosition: "Intrnet.NetPosition:NetPosition",
  SettlementInstruction: "Intrnet.SettlementInstruction:SettlementInstruction",
} as const;

export function getIntrnetPackageName(): string {
  const name = process.env.INTRNET_PACKAGE_NAME?.trim();
  if (!name) {
    throw new Error(
      "INTRNET_PACKAGE_NAME is required for PQS reads (DAML package name from daml.yaml, e.g. intrnet-contracts)",
    );
  }
  return name;
}

export function pqsTemplateRef(templateId: string, packageName = getIntrnetPackageName()): string {
  return `${packageName}:${templateId}`;
}
