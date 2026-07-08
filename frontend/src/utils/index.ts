export const fmt = {
  currency: (amount: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount),
  date: (d: string) =>
    new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)),
  dateShort: (d: string) =>
    new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(d)),
  number: (n: number) => new Intl.NumberFormat('en-US').format(n),
};

export const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400',
  ACCEPTED: 'bg-emerald-500/15 text-emerald-400',
  REJECTED: 'bg-red-500/15 text-red-400',
  NETTED: 'bg-ink-500 text-bone-300',
  OPEN: 'bg-sky-500/15 text-sky-400',
  COMPLETED: 'bg-lime-500/15 text-lime-400',
  CLOSED: 'bg-ink-500 text-bone-300',
  EXECUTED: 'bg-sky-500/15 text-sky-400',
  CONFIRMED: 'bg-emerald-500/15 text-emerald-400',
  ACKNOWLEDGED: 'bg-emerald-500/15 text-emerald-400',
  Active: 'bg-emerald-500/15 text-emerald-400',
  Suspended: 'bg-red-500/15 text-red-400',
};

export const getStatusColor = (s: string) => statusColors[s] ?? 'bg-ink-500 text-bone-300';

export const convertToUSD = (amount: number, currency: string, rates: { fromCurrency: string; toCurrency: string; rate: number }[]) => {
  if (currency === 'USD') return amount;
  const rate = rates.find(r => r.fromCurrency === currency && r.toCurrency === 'USD');
  return rate ? amount * rate.rate : null;
};
