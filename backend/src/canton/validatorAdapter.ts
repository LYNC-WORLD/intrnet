import axios from "axios";
import { LedgerRight, operatorAdminClient } from "../ledger/client";
import { CantonOnboardingAdapter } from "./types";

export class ValidatorCantonAdapter implements CantonOnboardingAdapter {
  async allocateParty(hint: string): Promise<{ partyId: string }> {
    const validatorApi = process.env.VALIDATOR_API_URL;
    const token = process.env.OPERATOR_ADMIN_JWT;

    if (validatorApi && token) {
      try {
        const res = await axios.post(
          `${validatorApi}/v0/admin/users`,
          { name: `bootstrap-${hint}`, partyHint: hint, createPartyIfMissing: true },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const partyId =
          res.data?.partyId ??
          res.data?.user?.partyId ??
          res.data?.result?.partyId;
        if (partyId) return { partyId: String(partyId) };
      } catch {}
    }

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
    const endpoint = process.env.VALIDATOR_PARTY_TOKEN_ENDPOINT;
    const adminToken = process.env.OPERATOR_ADMIN_JWT;
    if (endpoint && adminToken) {
      const res = await axios.post(
        endpoint,
        { userId: opts.userId, partyId: opts.partyId },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      const token = res.data?.token ?? res.data?.result?.token;
      if (token) return String(token);
    }

    if (process.env.VALIDATOR_STATIC_PARTY_TOKEN) {
      return process.env.VALIDATOR_STATIC_PARTY_TOKEN;
    }

    throw new Error(
      "Validator token minting is not configured. Set VALIDATOR_PARTY_TOKEN_ENDPOINT or VALIDATOR_STATIC_PARTY_TOKEN.",
    );
  }

  async listParties() {
    return operatorAdminClient().listParties();
  }
}
