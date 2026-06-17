import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";
import { prisma } from "../db";

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    return { error: "Invalid credentials", status: 401 as const };
  }
  if (user.status !== "ACTIVE") {
    return { error: "User is not active", status: 403 as const };
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return { error: "Invalid credentials", status: 401 as const };

  const signOptions: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "24h") as SignOptions["expiresIn"],
  };
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, signOptions);

  return {
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        partyId: user.partyId,
        agreementId: user.agreementId,
        role: user.role,
        companyName: user.companyName,
        status: user.status,
      },
    },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found", status: 404 as const };

  return {
    data: {
      id: user.id,
      email: user.email,
      partyId: user.partyId,
      agreementId: user.agreementId,
      role: user.role,
      companyName: user.companyName,
      status: user.status,
    },
  };
}
