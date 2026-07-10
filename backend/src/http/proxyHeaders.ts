export function withProxyHostHeader(headers: Record<string, string> = {}): Record<string, string> {
  const host = process.env.LEDGER_API_HOST_HEADER?.trim();
  if (!host) return headers;
  return { ...headers, Host: host };
}
