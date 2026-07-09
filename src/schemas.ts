import { z } from "zod";
import { ASPECT_RATIOS, DEFAULT_ASPECT_RATIO, DEFAULT_RESPONSE_FORMAT, MAX_IMAGES_PER_REQUEST, MAX_PROMPT_LENGTH, RESPONSE_FORMATS } from "./constants.js";

export const ImageGenerateSchema = z.object({
  prompt: z
    .string()
    .min(1, "Prompt is required")
    .max(MAX_PROMPT_LENGTH, "Prompt must not exceed 1500 characters")
    .describe(
      "Image description to generate. Max 1500 characters."
    ),

  aspect_ratio: z
    .enum(ASPECT_RATIOS)
    .default(DEFAULT_ASPECT_RATIO)
    .describe(
      "Image aspect ratio. Options: 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9"
    ),

  n: z
    .number()
    .int()
    .min(1, "Minimum 1 image")
    .max(MAX_IMAGES_PER_REQUEST, "Maximum 9 images per call")
    .default(1)
    .describe(
      "Number of images to generate (1-9). Using 9 is 8x faster than 9 separate calls."
    ),

  seed: z
    .number()
    .int()
    .min(0, "Seed must be >= 0")
    .max(4294967295, "Seed must fit in uint32")
    .optional()
    .describe(
      "Seed for reproducibility. Same seed + same parameters = same image."
    ),

  response_format: z
    .enum(RESPONSE_FORMATS)
    .default(DEFAULT_RESPONSE_FORMAT)
    .describe(
      "Response format. 'base64' for persistence (recommended), 'url' expires in 24h."
    ),

  prompt_optimizer: z
    .boolean()
    .default(false)
    .describe(
      "Enable automatic prompt optimization. May add extra elements."
    ),

  subject_reference: z
    .array(
      z.object({
        type: z.literal("character"),
        image_file: z.string().url("Invalid image URL"),
      })
    )
    .min(1, "Minimum 1 reference image")
    .max(5, "Maximum 5 reference images")
    .optional()
    .describe(
      "Reference images for Image-to-Image. Maintains visual identity of the character."
    ),

  output_dir: z
    .string()
    .optional()
    .describe(
      "Directory to save images. Must be within the working directory or MINIMAX_OUTPUT_DIR. Default: ./output/"
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
