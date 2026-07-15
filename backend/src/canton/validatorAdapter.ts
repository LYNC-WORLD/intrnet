import { operatorAdminClient, partyActReadRights } from "../ledger/client";
import { grantOperatorReadAsParty } from "../ledger/ledgerBootstrap";
import { CantonOnboardingAdapter } from "./types";

export class ValidatorCantonAdapter implements CantonOnboardingAdapter {
  async allocateParty(hint: string): Promise<{ partyId: string }> {
    const client = await operatorAdminClient();
    return client.allocateParty(hint);
  }

  async createLedgerUser(opts: { userId: string; partyId: string }): Promise<void> {
    const client = await operatorAdminClient();
    await client.createUser(opts.userId, partyActReadRights(opts.partyId), opts.partyId);
    try {
      await grantOperatorReadAsParty(opts.partyId);
    } catch (err) {
      console.warn(
        `Failed to grant operator CanReadAs for ${opts.partyId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  async listParties() {
    const client = await operatorAdminClient();
    return client.listParties();
  }
}
