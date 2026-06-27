import {
  RETRYABLE_ERRORS,
  FATAL_ERRORS,
  ERROR_MESSAGES,
} from "./constants.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export class MiniMaxApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly statusMsg: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "MiniMaxApiError";
  }

  get isRetryable(): boolean {
    return RETRYABLE_ERRORS.includes(this.statusCode);
  }

  get isFatal(): boolean {
    return FATAL_ERRORS.includes(this.statusCode);
  }

  get recoverySuggestion(): string | null {
    return ERROR_MESSAGES[this.statusCode] ?? null;
  }
}

export class EmptyResponseError extends Error {
  readonly code = "EMPTY_RESPONSE";

  constructor(message = "API returned success but no images") {
    super(message);
    this.name = "EmptyResponseError";
  }
}

export function toErrorResult(error: unknown): CallToolResult {
  if (error instanceof MiniMaxApiError) {
    const parts = [
      `MiniMax API error: ${error.statusMsg}`,
      `Status code: ${error.statusCode}`,
      error.recoverySuggestion ? `\nRecovery: ${error.recoverySuggestion}` : "",
    ].filter(Boolean);

    return {
      content: [{ type: "text" as const, text: parts.join("\n") }],
      isError: true as const,
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: error instanceof Error ? error.message : String(error)
    }],
    isError: true as const,
  };
}

export function toTextResult(
  text: string,
  structuredContent?: Record<string, unknown>
): CallToolResult {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}
