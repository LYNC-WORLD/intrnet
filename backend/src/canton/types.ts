export interface CantonOnboardingAdapter {
  allocateParty(hint: string): Promise<{ partyId: string }>;
  createLedgerUser(opts: { userId: string; partyId: string }): Promise<void>;
  listParties(): Promise<Array<{ party: string; isLocal: boolean }>>;
}
