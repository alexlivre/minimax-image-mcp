import { describe, it, expect, afterEach } from "vitest";
import { getApiKey } from "./env.js";

describe("getApiKey", () => {
  const original = process.env.MINIMAX_API_KEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MINIMAX_API_KEY;
    } else {
      process.env.MINIMAX_API_KEY = original;
    }
  });

  it("returns the key when MINIMAX_API_KEY is set", () => {
    process.env.MINIMAX_API_KEY = "sk-test-123";
    expect(getApiKey()).toBe("sk-test-123");
  });

  it("returns null when MINIMAX_API_KEY is not set", () => {
    delete process.env.MINIMAX_API_KEY;
    expect(getApiKey()).toBeNull();
  });
});
