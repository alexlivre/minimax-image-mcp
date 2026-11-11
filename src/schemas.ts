import { z } from "zod";
import {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_INLINE_IMAGES,
  DEFAULT_MODEL,
  DEFAULT_RESPONSE_FORMAT,
  IMAGE_DIMENSION_STEP,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGES_PER_REQUEST,
  MAX_PROMPT_LENGTH,
  MAX_REFERENCE_BYTES,
  MAX_REFERENCE_IMAGES,
  MIN_IMAGE_DIMENSION,
  MODEL_IDS,
  RESPONSE_FORMATS,
} from "./constants.js";

const WINDOWS_DRIVE_PATH = /^[a-z]:[\\/]/i;
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function isValidReferenceSource(value: string): boolean {
  if (/^https?:\/\/\S+$/i.test(value)) return true;

  const dataUrl = /^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/i.exec(value);
  if (dataUrl) {
    const payload = dataUrl[1] ?? "";
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    const bytes = Math.floor((payload.length * 3) / 4) - padding;
    return bytes > 0 && bytes <= MAX_REFERENCE_BYTES;
  }

  if (URI_SCHEME.test(value) && !WINDOWS_DRIVE_PATH.test(value)) return false;
  if (value.includes("\0")) return false;

  return /\.(?:jpe?g|png)$/i.test(value);
}

const referenceImageSchema = z.object({
  type: z.literal("character"),
  image_file: z
    .string()
    .refine(
      isValidReferenceSource,
      "Must be a public http(s) URL, a base64 data URL (image/jpeg or image/png), or a local JPEG/PNG file path",
    ),
});

export const ImageGenerateSchemaBase = z.object({
  prompt: z
    .string()
    .min(1, "Prompt is required")
    .max(MAX_PROMPT_LENGTH, `Prompt must not exceed ${MAX_PROMPT_LENGTH} characters`)
    .describe(
      "Image description to generate. Max 1500 characters."
    ),

  model: z
    .enum(MODEL_IDS)
    .default(DEFAULT_MODEL)
    .describe(
      "MiniMax image model. 'image-01' for text-to-image and image-to-image. 'image-01-live' requires subject_reference and ignores width/height."
    ),

  aspect_ratio: z
    .enum(ASPECT_RATIOS)
    .default(DEFAULT_ASPECT_RATIO)
    .describe(
      "Image aspect ratio. Options: 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9. Ignored when width and height are provided."
    ),

  width: z
    .number()
    .int()
    .min(MIN_IMAGE_DIMENSION, `Minimum width is ${MIN_IMAGE_DIMENSION}`)
    .max(MAX_IMAGE_DIMENSION, `Maximum width is ${MAX_IMAGE_DIMENSION}`)
    .refine(
      (value) => value % IMAGE_DIMENSION_STEP === 0,
      `Width must be divisible by ${IMAGE_DIMENSION_STEP}`,
    )
    .optional()
    .describe(
      "Explicit image width in pixels (512-2048, divisible by 8). Must be provided together with height. Only applies to image-01. Takes precedence over aspect_ratio."
    ),

  height: z
    .number()
    .int()
    .min(MIN_IMAGE_DIMENSION, `Minimum height is ${MIN_IMAGE_DIMENSION}`)
    .max(MAX_IMAGE_DIMENSION, `Maximum height is ${MAX_IMAGE_DIMENSION}`)
    .refine(
      (value) => value % IMAGE_DIMENSION_STEP === 0,
      `Height must be divisible by ${IMAGE_DIMENSION_STEP}`,
    )
    .optional()
    .describe(
      "Explicit image height in pixels (512-2048, divisible by 8). Must be provided together with width. Only applies to image-01."
    ),

  n: z
    .number()
    .int()
    .min(1, "Minimum 1 image")
    .max(MAX_IMAGES_PER_REQUEST, `Maximum ${MAX_IMAGES_PER_REQUEST} images per call`)
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
    .array(referenceImageSchema)
    .min(1, "Minimum 1 reference image")
    .max(MAX_REFERENCE_IMAGES, `Maximum ${MAX_REFERENCE_IMAGES} reference image per request`)
    .optional()
    .describe(
      "Single character reference image for image-to-image. Accepts a public HTTPS URL, a base64 data URL (image/jpeg or image/png, under 10 MB), or a local JPEG/PNG file path. Pass an absolute path for files in the workspace."
    ),

  output_dir: z
    .string()
    .optional()
    .describe(
      "Directory to save images. Absolute paths are accepted (use the workspace path to save in the project). Relative paths must stay under the process cwd. Default: ./output/"
    ),

  inline_images: z
    .boolean()
    .default(DEFAULT_INLINE_IMAGES)
    .describe(
      "Return generated images as MCP image content blocks in addition to file paths. Set false for large batches to save context."
    ),
});

export const ImageGenerateSchema = ImageGenerateSchemaBase.superRefine(
  (value, ctx) => {
    const hasWidth = value.width !== undefined;
    const hasHeight = value.height !== undefined;

    if (hasWidth !== hasHeight) {
      ctx.addIssue({
        code: "custom",
        path: [hasWidth ? "height" : "width"],
        message: "width and height must be provided together",
      });
    }

    if (value.model === "image-01-live" && !value.subject_reference) {
      ctx.addIssue({
        code: "custom",
        path: ["subject_reference"],
        message: "model image-01-live requires a subject_reference image",
      });
    }

    if (value.model === "image-01-live" && hasWidth && hasHeight) {
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: "width and height only apply to image-01",
      });
    }
  },
);

export type ImageGenerateInput = z.infer<typeof ImageGenerateSchema>;

export const BaseRespSchema = z.object({
  status_code: z.number(),
  status_msg: z.string().default(""),
});

export const ResponseEnvelopeSchema = z
  .object({
    base_resp: BaseRespSchema,
  })
  .passthrough();

const countSchema = z.union([z.string(), z.number()]).transform(String);

export const ImageGenerateResponseSchema = z.object({
  id: z.string(),
  data: z.object({
    image_urls: z.array(z.string().url()).optional(),
    image_base64: z.array(z.string()).optional(),
  }),
  metadata: z.object({
    failed_count: countSchema,
    success_count: countSchema,
  }),
  base_resp: BaseRespSchema.optional(),
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
