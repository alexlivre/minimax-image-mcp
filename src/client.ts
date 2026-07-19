import { z } from "zod";
import {
  IMAGE_API_URL,
  MODEL_ID,
  MAX_BACKOFF_MS,
  MAX_RETRIES,
  RETRY_DELAY_1002_MS,
  RETRY_DELAY_2045_MS,
  DEFAULT_TIMEOUT_MS,
  BODY_READ_TIMEOUT_MS,
} from "./constants.js";
import { MiniMaxApiError } from "./errors.js";
import {
  ImageGenerateResponseSchema,
  type ImageGenerateResponse,
} from "./schemas.js";

export interface ImageGenerateParams {
  prompt: string;
  aspect_ratio?: string;
  response_format?: "url" | "base64";
  n?: number;
  seed?: number;
  prompt_optimizer?: boolean;
  subject_reference?: Array<{ type: "character"; image_file: string }>;
}

export class MiniMaxClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeout: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async generateImage(
    params: ImageGenerateParams
  ): Promise<ImageGenerateResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(IMAGE_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL_ID,
            ...params,
          }),
          signal: AbortSignal.timeout(this.timeout),
        });

        const bodyPromise = response.text();
        const bodyTimeoutSignal = AbortSignal.timeout(BODY_READ_TIMEOUT_MS);
        const raw = await Promise.race([
          bodyPromise,
          new Promise<never>((_, reject) => {
            bodyTimeoutSignal.addEventListener("abort", () => {
              reject(new Error("Response body read timed out"));
            }, { once: true });
          }),
        ]);
        const data = ImageGenerateResponseSchema.parse(JSON.parse(raw));
        const statusCode = data.base_resp?.status_code;

        if (statusCode !== 0) {
          throw new MiniMaxApiError(
            data.base_resp?.status_msg || "Unknown error",
            statusCode,
            data.base_resp?.status_msg || "",
            data
          );
        }

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof MiniMaxApiError) {
          if (error.isFatal) throw error;
          if (error.isRetryable && attempt < MAX_RETRIES) {
            const delay =
              error.statusCode === 1002
                ? RETRY_DELAY_1002_MS
                : RETRY_DELAY_2045_MS;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
        }

        if (error instanceof z.ZodError) {
          throw new Error(
            `Unexpected API response shape: ${error.issues.map((i) => `${i.path.join(".")} - ${i.message}`).join("; ")}`
          );
        }

        if (attempt < MAX_RETRIES) {
          const exponential = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
          const delay = Math.random() * exponential; // Full Jitter (AWS)
          await new Promise((r) => setTimeout(r, Math.round(delay)));
          continue;
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }
}
