import { prisma } from "../db";
import { getCantonAdapter } from "../canton";
import { onboardCompany, OnboardCompanyInput } from "./onboardingService";

export async function createCompany(input: OnboardCompanyInput) {
  return onboardCompany(input);
}

export async function listCompanies() {
  return prisma.user.findMany({
    where: { role: "participant" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      companyName: true,
      partyId: true,
      ledgerUserId: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function listParties() {
  return getCantonAdapter().listParties();
}
