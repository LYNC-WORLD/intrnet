import "../env";
import { prisma } from "./index";
import { getOperatorPartyId } from "../ledger/operatorParty";

async function main() {
  const email = process.env.OPERATOR_EMAIL ?? "operator@intrnet.local";
  const oauthSub = process.env.OPERATOR_OAUTH_SUB?.trim() || null;

  let partyId = process.env.OPERATOR_PARTY ?? "operator";
  try {
    partyId = await getOperatorPartyId();
  } catch (err) {
    console.warn("[Seed] Could not resolve operator party on ledger, using OPERATOR_PARTY env:", err);
  }

  await prisma.user.upsert({
    where: { email },
    update: {
      role: "operator",
      status: "ACTIVE",
      companyName: "Intrnet Operator",
      partyId,
      ...(oauthSub ? { oauthSub } : {}),
    },
    create: {
      email,
      role: "operator",
      status: "ACTIVE",
      companyName: "Intrnet Operator",
      partyId,
      oauthSub,
      ledgerUserId: process.env.OPERATOR_LEDGER_USER_ID ?? null,
    },
  });

  console.log(
    `Seeded operator user: ${email} (partyId: ${partyId}${oauthSub ? `, oauthSub: ${oauthSub}` : ""})`,
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
