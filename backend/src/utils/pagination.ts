export function parsePagination(
  query: { page?: string; limit?: string },
  defaults: { page?: number; limit?: number } = {},
): { page: number; limit: number } {
  const defaultPage = defaults.page ?? 1;
  const defaultLimit = defaults.limit ?? 20;
  const parsedPage = parseInt(query.page ?? "", 10);
  const parsedLimit = parseInt(query.limit ?? "", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : defaultPage;
  const limitRaw = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : defaultLimit;
  const limit = Math.min(limitRaw, 100);
  return { page, limit };
}
