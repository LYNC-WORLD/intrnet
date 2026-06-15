export interface CantonOnboardingAdapter {
  allocateParty(hint: string): Promise<{ partyId: string }>;
  createLedgerUser(opts: { userId: string; partyId: string }): Promise<void>;
  mintPartyToken(opts: { userId: string; partyId: string }): Promise<string>;
  listParties(): Promise<Array<{ party: string; isLocal: boolean }>>;
}
