export function getApiKey(): string | null {
  return process.env.MINIMAX_API_KEY ?? null;
}
