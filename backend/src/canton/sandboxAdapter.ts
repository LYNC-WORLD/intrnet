import jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";
import { LedgerRight, operatorAdminClient } from "../ledger/client";
import { CantonOnboardingAdapter } from "./types";

export class SandboxCantonAdapter implements CantonOnboardingAdapter {
  async allocateParty(hint: string): Promise<{ partyId: string }> {
    return operatorAdminClient().allocateParty(hint);
  }

  async createLedgerUser(opts: { userId: string; partyId: string }): Promise<void> {
    const rights: LedgerRight[] = [
      { kind: { CanActAs: { value: { party: opts.partyId } } } },
      { kind: { CanReadAs: { value: { party: opts.partyId } } } },
    ];
    await operatorAdminClient().createUser(opts.userId, rights, opts.partyId);
  }

  async mintPartyToken(opts: { userId: string; partyId: string }): Promise<string> {
    const secret = process.env.SANDBOX_JWT_SECRET ?? process.env.JWT_SECRET;
    if (!secret) throw new Error("SANDBOX_JWT_SECRET or JWT_SECRET must be set");

    const signOptions: SignOptions = {
      expiresIn: (process.env.PARTY_TOKEN_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"],
    };

    return jwt.sign(
      {
        sub: opts.userId,
        actAs: [opts.partyId],
        readAs: [opts.partyId],
        scope: "daml_ledger_api",
      },
      secret,
      signOptions,
    );
  }

  async listParties() {
    return operatorAdminClient().listParties();
  }
}
