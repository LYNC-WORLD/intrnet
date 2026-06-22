const hintToPartyId = new Map<string, string>();

export function getCachedPartyByHint(hint: string): string | undefined {
  return hintToPartyId.get(hint);
}

export function cachePartyByHint(hint: string, partyId: string): void {
  hintToPartyId.set(hint, partyId);
}

export function clearPartyHintCache(): void {
  hintToPartyId.clear();
}
