export function withProxyHostHeader(headers: Record<string, string> = {}): Record<string, string> {
  const host = process.env.LEDGER_API_HOST_HEADER?.trim();
  if (!host) return headers;
  return { ...headers, Host: host };
}

export function utilityRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const host = process.env.UTILITY_API_HOST_HEADER?.trim();
  if (host) headers.Host = host;
  return headers;
}
