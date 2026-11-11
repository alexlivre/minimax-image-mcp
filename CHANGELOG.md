# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-11

### Added

- **Local reference images:** `subject_reference.image_file` now accepts a local JPEG/PNG path in addition to public URLs and base64 data URLs. The server resolves symlinks, validates magic bytes and the 10 MB limit, and converts the file to a data URL before the API call.
- **Read lockdown:** optional `MINIMAX_ALLOWED_REFERENCE_ROOTS` restricts which local directories can be read.
- **Tests:** 175 total (from 159), including local-path conversion, missing files, WebP rejection, size limits, and read-root enforcement.

### Changed

- README and SECURITY now document the reference-image read boundary and the new environment variable.

## [1.1.0] - 2026-11-11

### Added

- **Inline image blocks:** the tool now returns MCP `image` content blocks (`inline_images`, default `true`) alongside the saved file paths.
- **Explicit dimensions:** `width` and `height` parameters (512–2048 px, divisible by 8). When both are present they replace `aspect_ratio` in the upstream request.
- **Model selection:** `model` parameter supporting `image-01` and `image-01-live`.
- **Configurable reliability:** `MINIMAX_TIMEOUT_MS` and `MINIMAX_MAX_RETRIES` environment variables.
- **Retry-After support:** HTTP 429 responses honor the `Retry-After` header.
- **Bounded downloads:** URL downloads are capped at 20 MB and image bytes are validated before saving.
- **MCP Registry metadata:** `server.json` and `mcpName` for registry ownership verification.

### Fixed

- **Error envelope parsing:** MiniMax reports failures as HTTP 200 with a non-zero `base_resp.status_code`. The client now validates the envelope before the success payload, so rate-limit errors (1002/2045) are classified and retried instead of surfacing as "Unexpected API response shape".
- **Cancellation propagation:** aborting a tool call now cancels the upstream request and URL downloads, not just the save phase.
- **Reference image constraints:** `subject_reference` is limited to one image (matching the API) and accepts base64 data URLs (JPEG/PNG, under 10 MB).
- **Error taxonomy:** added 2013, 2022, 2053, 2061, 2062, 2064, 2066, 2067, 2068, 2069, and 1042; unknown codes are no longer retried blindly.
- **Response robustness:** metadata counts accept strings or numbers, HTTP status is reported for non-JSON errors, and invalid response shapes are non-retryable.
- **Filenames:** accented prompts are transliterated (`coração` → `coracao`) instead of losing characters.

### Changed

- Upgraded `@modelcontextprotocol/sdk` to 1.32.2 and Zod to 4.6.6.
- Raised the test suite from 125 to 159 tests; coverage is 93.9% lines / 89.8% branches / 95.9% functions.
- README, error table, and architecture notes updated to match the current API and parameters.

## [1.0.4] - 2026-07-31

### Fixed

- **utils:** Accept absolute `output_dir` paths so agents can save images directly into the open workspace (Cursor MCP `cwd` is not the project root). Relative paths remain sandboxed to the process cwd.
- **utils:** Optional `MINIMAX_ALLOWED_OUTPUT_ROOTS` for locking writes to configured roots.

### Changed

- MCP instructions and docs now tell agents to pass an absolute workspace path for `output_dir` instead of copying files afterward.

### Added

- GitHub Actions `publish.yml` for npm Trusted Publishing (OIDC)

## [1.0.3] - 2026-07-19

### Fixed

- **packaging:** Add `license: "MIT"` to `package.json` — npm was displaying "License: none" instead of MIT

## [1.0.2] - 2026-07-19

### Fixed

- **client:** Eliminate timer leak in body read timeout — replaced `setTimeout` with `AbortSignal.timeout` to prevent timer accumulation in long-running MCP processes
- **constants:** Add error 1008 (insufficient balance) to `FATAL_ERRORS` — previously caused 3 unnecessary retries (~3 min wasted)
- **utils:** Add 30s timeout to `downloadImageFromUrl` — prevents indefinite hangs on slow/unresponsive URLs
- **shutdown:** Exit with code 1 when `server.close()` fails — process supervisors (systemd, Docker) can now detect shutdown failures
- **utils:** Detect real image format for file extension — images now saved as `.jpeg`/`.png`/`.webp` based on actual format instead of hardcoded `.jpeg`

### Added

- `errors.test.ts` — 19 tests covering all error classes and formatting
- `shutdown.test.ts` — 5 tests covering signal handling and exit codes
- Server tests for abort signal handling and URL download path
- Total test count: 85 → 119

### Changed

- Raised coverage thresholds to 90% lines / 85% branches
- Added `.opencode/` to `.gitignore`
- Updated author to Alex Santos

## [1.0.1] - 2026-07-18

### Changed

- Hardened reliability with URL download support
- Standardized English messages
- Raised coverage to 85/85/80/85

## [1.0.0] - 2026-07-17

### Added

- Initial release
- Text-to-image generation via MiniMax `image-01` model
- Batch generation (1-9 images per call)
- Image-to-image with character reference images
- Aspect ratio support (1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9)
- Seed-based reproducibility
- Prompt optimization
- Automatic retry with exponential backoff and full jitter
- Path-traversal guard for output directory
- Progress notifications
- Structured output schema
- Clean shutdown on SIGINT/SIGTERM
