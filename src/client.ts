import {
  IMAGE_API_URL,
  MODEL_ID,
  MAX_RETRIES,
  RETRY_DELAY_1002_MS,
  RETRY_DELAY_2045_MS,
  DEFAULT_TIMEOUT_MS,
} from "./constants.js";
import { MiniMaxApiError } from "./errors.js";

export interface ImageGenerateParams {
  prompt: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  response_format?: "url" | "base64";
  n?: number;
  seed?: number;
  prompt_optimizer?: boolean;
  subject_reference?: Array<{ type: "character"; image_file: string }>;
}

export interface ImageGenerateResponse {
  id: string;
  data: {
    image_urls?: string[];
    image_base64?: string[];
  };
  metadata: {
    failed_count: string;
    success_count: string;
  };
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export class MiniMaxClient {
  private apiKey: string;
  private timeout: number;

  constructor(apiKey: string, timeout = DEFAULT_TIMEOUT_MS) {
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

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

        const data = (await response.json()) as ImageGenerateResponse;
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

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }
}
