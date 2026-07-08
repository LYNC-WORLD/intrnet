import "../env";
import { prisma } from "./index";
import { getOperatorPartyId } from "../ledger/operatorParty";

async function main() {
  const email = process.env.OPERATOR_EMAIL ?? "operator@intrnet.local";
  const oauthSub = process.env.OPERATOR_OAUTH_SUB?.trim() || null;

  const partyId = await getOperatorPartyId();

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
      ledgerUserId: process.env.LEDGER_API_ADMIN_USER ?? null,
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
