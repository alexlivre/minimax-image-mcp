import { DEFAULT_TIMEOUT_MS, MAX_RETRIES } from "./constants.js";

export function getApiKey(): string | null {
  return process.env.MINIMAX_API_KEY ?? null;
}

function readInteger(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;

  return value;
}

export function getTimeoutMs(): number {
  return readInteger("MINIMAX_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 1000, 600000);
}

export function getMaxRetries(): number {
  return readInteger("MINIMAX_MAX_RETRIES", MAX_RETRIES, 0, 10);
}
