import { z } from "zod";
import { ASPECT_RATIOS, DEFAULT_ASPECT_RATIO, DEFAULT_RESPONSE_FORMAT, MAX_IMAGES_PER_REQUEST, MAX_PROMPT_LENGTH, RESPONSE_FORMATS } from "./constants.js";

export const ImageGenerateSchema = z.object({
  prompt: z
    .string()
    .min(1, "Prompt é obrigatório")
    .max(MAX_PROMPT_LENGTH, "Prompt deve ter no máximo 1500 caracteres")
    .describe(
      "Descrição da imagem a gerar. Máximo 1500 caracteres."
    ),

  aspect_ratio: z
    .enum(ASPECT_RATIOS)
    .default(DEFAULT_ASPECT_RATIO)
    .describe(
      "Proporção da imagem. Opções: 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9"
    ),

  n: z
    .number()
    .int()
    .min(1, "Mínimo 1 imagem")
    .max(MAX_IMAGES_PER_REQUEST, "Máximo 9 imagens por chamada")
    .default(1)
    .describe(
      "Número de imagens a gerar (1-9). Usar 9 é 8× mais rápido que 9 chamadas separadas."
    ),

  seed: z
    .number()
    .int()
    .min(0, "Seed deve ser >= 0")
    .max(4294967295, "Seed deve caber em uint32")
    .optional()
    .describe(
      "Seed para reprodutibilidade. Mesmo seed + mesmos parâmetros = mesma imagem."
    ),

  response_format: z
    .enum(RESPONSE_FORMATS)
    .default(DEFAULT_RESPONSE_FORMAT)
    .describe(
      "Formato de resposta. 'base64' para persistência (recomendado), 'url' expira em 24h."
    ),

  prompt_optimizer: z
    .boolean()
    .default(false)
    .describe(
      "Ativa otimização automática do prompt. Pode adicionar elementos extras."
    ),

  subject_reference: z
    .array(
      z.object({
        type: z.literal("character"),
        image_file: z.string().url("URL da imagem inválida"),
      })
    )
    .min(1, "Mínimo 1 imagem de referência")
    .max(5, "Máximo 5 imagens de referência")
    .optional()
    .describe(
      "Imagens de referência para Image-to-Image. Mantém identidade visual do personagem."
    ),

  output_dir: z
    .string()
    .optional()
    .describe(
      "Diretório para salvar imagens. Padrão: ./output/ ou MINIMAX_OUTPUT_DIR"
    ),
});

export type ImageGenerateInput = z.infer<typeof ImageGenerateSchema>;

export const ImageGenerateResponseSchema = z.object({
  id: z.string(),
  data: z.object({
    image_urls: z.array(z.string().url()).optional(),
    image_base64: z.array(z.string()).optional(),
  }),
  metadata: z.object({
    failed_count: z.string(),
    success_count: z.string(),
  }),
  base_resp: z.object({
    status_code: z.number(),
    status_msg: z.string(),
  }),
});

export type ImageGenerateResponse = z.infer<typeof ImageGenerateResponseSchema>;

export const ImageGenerateOutputSchema = z.object({
  id: z.string(),
  image_count: z.number().int(),
  saved_count: z.number().int(),
  file_paths: z.array(z.string()),
  failures: z
    .array(z.object({ index: z.number().int(), error: z.string() }))
    .optional(),
  metadata: z.object({
    failed_count: z.string(),
    success_count: z.string(),
  }),
});
export type ImageGenerateOutput = z.infer<typeof ImageGenerateOutputSchema>;
