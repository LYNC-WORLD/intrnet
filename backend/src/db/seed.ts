import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "./index";

async function main() {
  const email = process.env.OPERATOR_EMAIL ?? "operator@netclear.local";
  const password = process.env.OPERATOR_PASSWORD ?? "operator123";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "operator",
      status: "ACTIVE",
      companyName: "NetClear Operator",
      partyId: process.env.OPERATOR_PARTY ?? "operator",
      partyToken: process.env.OPERATOR_JWT ?? "operator-jwt-not-set",
    },
    create: {
      email,
      passwordHash,
      role: "operator",
      status: "ACTIVE",
      companyName: "NetClear Operator",
      partyId: process.env.OPERATOR_PARTY ?? "operator",
      partyToken: process.env.OPERATOR_JWT ?? "operator-jwt-not-set",
      ledgerUserId: process.env.OPERATOR_LEDGER_USER_ID ?? "netclear-operator",
    },
  });

  console.log(`Seeded operator user: ${email}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
