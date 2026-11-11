import type { z } from "zod";
import {
  IMAGE_API_URL,
  DEFAULT_MODEL,
  DEFAULT_ASPECT_RATIO,
  MAX_BACKOFF_MS,
  MAX_RETRY_AFTER_MS,
  BODY_READ_TIMEOUT_MS,
  RETRY_DELAYS,
} from "./constants.js";
import {
  MiniMaxApiError,
  MiniMaxHttpError,
  RequestCancelledError,
  RequestTimeoutError,
} from "./errors.js";
import { getMaxRetries, getTimeoutMs } from "./env.js";
import { fetchText } from "./http.js";
import {
  ImageGenerateResponseSchema,
  ResponseEnvelopeSchema,
  type ImageGenerateResponse,
} from "./schemas.js";

export interface ImageGenerateParams {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  response_format?: "url" | "base64";
  n?: number;
  seed?: number;
  prompt_optimizer?: boolean;
  subject_reference?: Array<{ type: "character"; image_file: string }>;
}

function buildRequestBody(params: ImageGenerateParams): Record<string, unknown> {
  const { prompt, model, width, height, aspect_ratio, ...rest } = params;
  const dimensions =
    width !== undefined && height !== undefined
      ? { width, height }
      : { aspect_ratio: aspect_ratio ?? DEFAULT_ASPECT_RATIO };

  return {
    model: model ?? DEFAULT_MODEL,
    prompt,
    ...dimensions,
    ...rest,
  };
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".")} - ${issue.message}`)
    .join("; ");
}

function parseRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (!raw) return undefined;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const date = Date.parse(raw);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_AFTER_MS);
  }

  return undefined;
}

function fullJitterDelay(attempt: number): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
  return Math.round(Math.random() * ceiling);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MiniMaxClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeout: number = getTimeoutMs(),
    private readonly maxRetries: number = getMaxRetries(),
  ) {}

  async generateImage(
    params: ImageGenerateParams,
    signal?: AbortSignal,
  ): Promise<ImageGenerateResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const { response, text } = await fetchText(
          IMAGE_API_URL,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildRequestBody(params)),
          },
          {
            requestTimeoutMs: this.timeout,
            bodyTimeoutMs: Math.max(BODY_READ_TIMEOUT_MS, this.timeout),
            signal,
          },
        );

        return this.parseResponse(text, response);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (
          error instanceof RequestCancelledError ||
          error instanceof RequestTimeoutError
        ) {
          throw error;
        }

        if (error instanceof MiniMaxApiError) {
          if (error.isFatal || !error.isRetryable) throw error;
          if (attempt < this.maxRetries) {
            await sleep(RETRY_DELAYS[error.statusCode] ?? fullJitterDelay(attempt));
            continue;
          }
          throw error;
        }

        if (error instanceof MiniMaxHttpError) {
          if (!error.isRetryable || attempt >= this.maxRetries) throw error;
          await sleep(error.retryAfterMs ?? fullJitterDelay(attempt));
          continue;
        }

        if (attempt < this.maxRetries) {
          await sleep(fullJitterDelay(attempt));
          continue;
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private parseResponse(text: string, response: Response): ImageGenerateResponse {
    let json: unknown;

    try {
      json = JSON.parse(text);
    } catch {
      throw new MiniMaxHttpError(
        `MiniMax API returned invalid JSON (HTTP ${response.status})`,
        response.status,
        parseRetryAfter(response),
      );
    }

    const envelope = ResponseEnvelopeSchema.safeParse(json);
    if (envelope.success && envelope.data.base_resp.status_code !== 0) {
      const baseResp = envelope.data.base_resp;
      throw new MiniMaxApiError(
        baseResp.status_msg || "Unknown error",
        baseResp.status_code,
        baseResp.status_msg,
        json,
      );
    }

    if (!response.ok) {
      throw new MiniMaxHttpError(
        `MiniMax API request failed: HTTP ${response.status} ${response.statusText}`.trim(),
        response.status,
        parseRetryAfter(response),
      );
    }

    const parsed = ImageGenerateResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new MiniMaxHttpError(
        `Unexpected API response shape: ${formatZodIssues(parsed.error)}`,
        response.status,
      );
    }

    return parsed.data;
  }
}
