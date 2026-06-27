// API
export const IMAGE_API_URL = "https://api.minimax.io/v1/image_generation";
export const MODEL_ID = "image-01";

// Limits
export const MAX_PROMPT_LENGTH = 1500;
export const MAX_IMAGES_PER_REQUEST = 9;
export const MAX_BACKOFF_MS = 30000;
export const DEFAULT_TIMEOUT_MS = 60000;

// Aspect Ratios
export const ASPECT_RATIOS = [
  "1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"
] as const;

export type AspectRatio = typeof ASPECT_RATIOS[number];

// Default values
export const DEFAULT_ASPECT_RATIO: AspectRatio = "1:1";
export const DEFAULT_RESPONSE_FORMAT: ResponseFormat = "base64";

// Response Formats
export const RESPONSE_FORMATS = ["url", "base64"] as const;
export type ResponseFormat = typeof RESPONSE_FORMATS[number];

// Error codes
export const RETRYABLE_ERRORS = [1002, 2045];
export const FATAL_ERRORS = [1004, 2049, 2056, 1026, 1027];

export const ERROR_MESSAGES: Record<number, string> = {
  1002: "Rate limit exceeded. Aguarde 60s e tente novamente.",
  1004: "Não autorizado. Verifique MINIMAX_API_KEY.",
  1008: "Saldo insuficiente. Recarregue sua conta MiniMax.",
  1026: "Prompt bloqueado por conteúdo sensível. Reformule o prompt.",
  1027: "Output bloqueado por conteúdo sensível. Reformule o prompt.",
  2045: "Growth limit atingido. Aguarde 30s e tente novamente.",
  2049: "API Key inválida. Verifique MINIMAX_API_KEY.",
  2056: "Cota da janela de 5h esgotada. Aguarde ou verifique seu plano.",
};

// Retry
export const MAX_RETRIES = 3;
export const RETRY_DELAY_1002_MS = 60000;
export const RETRY_DELAY_2045_MS = 30000;
