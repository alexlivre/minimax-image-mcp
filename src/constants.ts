// API
export const IMAGE_API_URL = "https://api.minimax.io/v1/image_generation";

// Models
export const MODEL_IDS = ["image-01", "image-01-live"] as const;
export type ModelId = typeof MODEL_IDS[number];
export const DEFAULT_MODEL: ModelId = "image-01";

// Limits
export const MAX_PROMPT_LENGTH = 1500;
export const MAX_IMAGES_PER_REQUEST = 9;
export const MIN_IMAGE_DIMENSION = 512;
export const MAX_IMAGE_DIMENSION = 2048;
export const IMAGE_DIMENSION_STEP = 8;
export const MAX_REFERENCE_IMAGES = 1;
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_BACKOFF_MS = 30000;
export const DEFAULT_TIMEOUT_MS = 60000;
export const BODY_READ_TIMEOUT_MS = 60000;
export const DOWNLOAD_TIMEOUT_MS = 30000;
export const MAX_RETRY_AFTER_MS = 60000;

// Aspect Ratios
export const ASPECT_RATIOS = [
  "1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"
] as const;

export type AspectRatio = typeof ASPECT_RATIOS[number];

// Default values
export const DEFAULT_ASPECT_RATIO: AspectRatio = "1:1";
export const DEFAULT_RESPONSE_FORMAT: ResponseFormat = "base64";
export const DEFAULT_INLINE_IMAGES = true;

// Response Formats
export const RESPONSE_FORMATS = ["url", "base64"] as const;
export type ResponseFormat = typeof RESPONSE_FORMATS[number];

// Error codes
export const RETRYABLE_ERRORS = [1000, 1001, 1002, 1024, 1033, 2045, 2064, 2066];
export const FATAL_ERRORS = [
  1004, 1008, 1026, 1027, 1042, 2013, 2022, 2049,
  2053, 2056, 2061, 2062, 2067, 2068, 2069,
];

export const RETRY_DELAYS: Record<number, number> = {
  1002: 60000,
  2045: 30000,
  2064: 5000,
  2066: 5000,
};

export const ERROR_MESSAGES: Record<number, string> = {
  1000: "Unknown server error. Retry shortly.",
  1001: "Request timed out upstream. Retry shortly.",
  1002: "Rate limit exceeded. Wait 60s and retry.",
  1004: "Unauthorized. Verify MINIMAX_API_KEY.",
  1008: "Insufficient balance. Top up your MiniMax account.",
  1024: "Internal server error. Retry shortly.",
  1026: "Prompt blocked due to sensitive content. Revise the prompt.",
  1027: "Output blocked due to sensitive content. Revise the prompt.",
  1033: "Upstream system error. Retry shortly.",
  1042: "Prompt contains too many invisible or illegal characters. Clean the prompt.",
  2013: "Invalid parameters. Check model, dimensions, aspect ratio, and reference image.",
  2022: "Model does not exist or your account has no access to it.",
  2045: "Growth limit reached. Wait 30s and retry.",
  2049: "Invalid API key. Verify MINIMAX_API_KEY.",
  2053: "Insufficient credit. Purchase credits or upgrade your plan.",
  2056: "5-hour quota exhausted. Wait for the next window or check your plan.",
  2061: "Your current plan does not support this model.",
  2062: "M Plan rate limit reached. Lower the request rate.",
  2064: "Server cluster is under high load. Retry shortly.",
  2066: "Request processing timed out. Retry shortly.",
  2067: "Usage limit reached and credit auto-consumption is off.",
  2068: "Your plan tier does not support this model.",
  2069: "Model is no longer available. Switch to image-01.",
};

// Retry
export const MAX_RETRIES = 3;
