import { describe, it, expect } from "vitest";
import { MiniMaxApiError, EmptyResponseError, toErrorResult, toTextResult } from "./errors.js";

describe("MiniMaxApiError", () => {
  it("stores statusCode and statusMsg", () => {
    const err = new MiniMaxApiError("msg", 1002, "Rate limit exceeded");
    expect(err.statusCode).toBe(1002);
    expect(err.statusMsg).toBe("Rate limit exceeded");
    expect(err.message).toBe("msg");
  });

  it("has name 'MiniMaxApiError'", () => {
    const err = new MiniMaxApiError("msg", 1004, "");
    expect(err.name).toBe("MiniMaxApiError");
  });

  it("isRetryable returns true for 1002", () => {
    expect(new MiniMaxApiError("", 1002, "").isRetryable).toBe(true);
  });

  it("isRetryable returns true for 2045", () => {
    expect(new MiniMaxApiError("", 2045, "").isRetryable).toBe(true);
  });

  it("isRetryable returns false for non-retryable codes", () => {
    expect(new MiniMaxApiError("", 1004, "").isRetryable).toBe(false);
    expect(new MiniMaxApiError("", 9999, "").isRetryable).toBe(false);
  });

  it("isFatal returns true for all fatal codes", () => {
    for (const code of [1004, 1008, 2049, 2056, 1026, 1027]) {
      expect(new MiniMaxApiError("", code, "").isFatal).toBe(true);
    }
  });

  it("isFatal returns false for non-fatal codes", () => {
    expect(new MiniMaxApiError("", 1002, "").isFatal).toBe(false);
    expect(new MiniMaxApiError("", 9999, "").isFatal).toBe(false);
  });

  it("returns recoverySuggestion for known error codes", () => {
    expect(new MiniMaxApiError("", 1002, "").recoverySuggestion).toContain("60s");
    expect(new MiniMaxApiError("", 1004, "").recoverySuggestion).toContain("MINIMAX_API_KEY");
    expect(new MiniMaxApiError("", 2045, "").recoverySuggestion).toContain("30s");
  });

  it("returns null for unknown error codes", () => {
    expect(new MiniMaxApiError("", 9999, "").recoverySuggestion).toBeNull();
  });
});

describe("EmptyResponseError", () => {
  it("has default message", () => {
    const err = new EmptyResponseError();
    expect(err.message).toBe("API returned success but no images");
  });

  it("accepts custom message", () => {
    const err = new EmptyResponseError("custom msg");
    expect(err.message).toBe("custom msg");
  });

  it("has code 'EMPTY_RESPONSE'", () => {
    expect(new EmptyResponseError().code).toBe("EMPTY_RESPONSE");
  });
});

describe("toErrorResult", () => {
  it("formats MiniMaxApiError with recovery suggestion", () => {
    const err = new MiniMaxApiError("rate limit", 1002, "Rate limit exceeded");
    const result = toErrorResult(err);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("MiniMax API error");
    expect(result.content[0].text).toContain("Recovery:");
  });

  it("formats MiniMaxApiError without recovery suggestion", () => {
    const err = new MiniMaxApiError("unknown", 9999, "Unknown error");
    const result = toErrorResult(err);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("Recovery:");
  });

  it("formats generic Error", () => {
    const result = toErrorResult(new Error("something broke"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("something broke");
  });

  it("formats non-Error value as string", () => {
    const result = toErrorResult("string error");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("string error");
  });

  it("formats null as string", () => {
    const result = toErrorResult(null);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("null");
  });
});

describe("toTextResult", () => {
  it("returns text content without structuredContent", () => {
    const result = toTextResult("hello");
    expect(result.content[0].text).toBe("hello");
    expect(result.structuredContent).toBeUndefined();
    expect(result.isError).toBeUndefined();
  });

  it("returns text content with structuredContent", () => {
    const result = toTextResult("hello", { id: "123", count: 5 });
    expect(result.content[0].text).toBe("hello");
    expect(result.structuredContent).toEqual({ id: "123", count: 5 });
  });
});
