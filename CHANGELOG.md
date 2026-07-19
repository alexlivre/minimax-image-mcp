# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
