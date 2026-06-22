import { prisma } from "../db";
import {
  isPlaceholderEmail,
  placeholderEmailFromSub,
  verifyOAuthToken,
} from "../auth/oauth";

async function linkOperatorByOauthSub(
  sub: string,
  issuer: string,
  email: string | null,
) {
  const operatorOauthSub = process.env.OPERATOR_OAUTH_SUB?.trim();
  if (!operatorOauthSub || sub !== operatorOauthSub) return null;

  const operator = await prisma.user.findFirst({
    where: { role: "operator" },
    orderBy: { createdAt: "asc" },
  });
  if (!operator) return null;
  if (operator.oauthSub && operator.oauthSub !== sub) {
    throw new Error("Operator OAuth subject is already linked to another identity");
  }
  if (operator.oauthSub === sub) return operator;

  return prisma.user.update({
    where: { id: operator.id },
    data: {
      oauthProvider: issuer,
      oauthSub: sub,
      ...(email && isPlaceholderEmail(operator.email) ? { email } : {}),
    },
  });
}

async function upgradePlaceholderEmail(userId: string, email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== userId) {
    throw new Error("Email is already linked to another account");
  }

  return prisma.user.update({
    where: { id: userId },
    data: { email },
  });
}

export async function oauthLogin(oauthToken: string) {
  let identity: Awaited<ReturnType<typeof verifyOAuthToken>>;
  try {
    identity = await verifyOAuthToken(oauthToken);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid OAuth token", status: 401 as const };
  }

  let isNewUser = false;
  let user = await prisma.user.findUnique({ where: { oauthSub: identity.sub } });

  if (!user) {
    try {
      user = await linkOperatorByOauthSub(identity.sub, identity.issuer, identity.email);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not link operator identity",
        status: 409 as const,
      };
    }
  }

  if (!user) {
    isNewUser = true;
    user = await prisma.user.create({
      data: {
        email: identity.email ?? placeholderEmailFromSub(identity.sub),
        oauthProvider: identity.issuer,
        oauthSub: identity.sub,
        role: "participant",
        status: "PENDING",
      },
    });
  } else if (identity.email && isPlaceholderEmail(user.email)) {
    try {
      user = await upgradePlaceholderEmail(user.id, identity.email);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not update email",
        status: 409 as const,
      };
    }
  }

  const onboardingRequest = await prisma.onboardingRequest.findUnique({
    where: { userId: user.id },
    select: { id: true, state: true },
  });

  return {
    data: {
      isNewUser,
      user: {
        id: user.id,
        email: user.email,
        partyId: user.partyId,
        agreementId: user.agreementId,
        role: user.role,
        companyName: user.companyName,
        status: user.status,
        onboardingState: onboardingRequest?.state ?? null,
      },
    },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      onboardingRequest: {
        select: {
          id: true,
          state: true,
        },
      },
    },
  });
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
      oauthSub: user.oauthSub,
      onboardingRequest: user.onboardingRequest,
    },
  };
}
