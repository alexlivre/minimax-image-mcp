import { describe, it, expect, afterEach } from "vitest";
import { getApiKey, getMaxRetries, getTimeoutMs } from "./env.js";
import { DEFAULT_TIMEOUT_MS, MAX_RETRIES } from "./constants.js";

const ENV_KEYS = [
  "MINIMAX_API_KEY",
  "MINIMAX_TIMEOUT_MS",
  "MINIMAX_MAX_RETRIES",
] as const;

const original = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original[key];
    }
  }
});

describe("getApiKey", () => {
  it("returns the key when MINIMAX_API_KEY is set", () => {
    process.env.MINIMAX_API_KEY = "sk-test-123";
    expect(getApiKey()).toBe("sk-test-123");
  });

  it("returns null when MINIMAX_API_KEY is not set", () => {
    delete process.env.MINIMAX_API_KEY;
    expect(getApiKey()).toBeNull();
  });
});

describe("getTimeoutMs", () => {
  it("returns the default when unset", () => {
    delete process.env.MINIMAX_TIMEOUT_MS;
    expect(getTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
  });

  it("reads a valid override", () => {
    process.env.MINIMAX_TIMEOUT_MS = "120000";
    expect(getTimeoutMs()).toBe(120000);
  });

  it("ignores non-numeric values", () => {
    process.env.MINIMAX_TIMEOUT_MS = "soon";
    expect(getTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
  });

  it("ignores values outside the allowed range", () => {
    process.env.MINIMAX_TIMEOUT_MS = "10";
    expect(getTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
  });
});

describe("getMaxRetries", () => {
  it("returns the default when unset", () => {
    delete process.env.MINIMAX_MAX_RETRIES;
    expect(getMaxRetries()).toBe(MAX_RETRIES);
  });

  it("reads a valid override including zero", () => {
    process.env.MINIMAX_MAX_RETRIES = "0";
    expect(getMaxRetries()).toBe(0);
    process.env.MINIMAX_MAX_RETRIES = "5";
    expect(getMaxRetries()).toBe(5);
  });

  it("ignores invalid values", () => {
    process.env.MINIMAX_MAX_RETRIES = "11";
    expect(getMaxRetries()).toBe(MAX_RETRIES);
  });
});
