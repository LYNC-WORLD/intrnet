import { operatorAdminClient, partyActReadRights } from "../ledger/client";
import { CantonOnboardingAdapter } from "./types";

export class ValidatorCantonAdapter implements CantonOnboardingAdapter {
  async allocateParty(hint: string): Promise<{ partyId: string }> {
    const client = await operatorAdminClient();
    return client.allocateParty(hint);
  }

  async createLedgerUser(opts: { userId: string; partyId: string }): Promise<void> {
    const client = await operatorAdminClient();
    await client.createUser(opts.userId, partyActReadRights(opts.partyId), opts.partyId);
  }

  async listParties() {
    const client = await operatorAdminClient();
    return client.listParties();
  }
}
