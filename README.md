# minimax-image-mcp

> A Model Context Protocol (MCP) server that wraps the [MiniMax](https://api.minimax.io) image generation API. Exposes a single tool, `minimax_image_generate`, that any MCP-compatible client (Claude Desktop, opencode, Cursor, etc.) can call to generate images from text prompts.

[![npm version](https://img.shields.io/npm/v/minimax-image-mcp.svg)](https://www.npmjs.com/package/minimax-image-mcp)
[![npm downloads](https://img.shields.io/npm/dm/minimax-image-mcp.svg)](https://www.npmjs.com/package/minimax-image-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen)](https://nodejs.org)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/alexlivre/minimax-image-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/alexlivre/minimax-image-mcp/actions)
[![codecov](https://codecov.io/gh/alexlivre/minimax-image-mcp/graph/badge.svg)](https://codecov.io/gh/alexlivre/minimax-image-mcp)

---

## Table of Contents

- [Why this exists](#why-this-exists)
- [Features](#features)
- [Quickstart](#quickstart)
- [Installation](#installation)
- [Using via npm](#using-via-npm)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Error Codes](#error-codes)
- [Best Practices](#best-practices)
- [Limitations](#limitations)
- [Architecture](#architecture)
- [Development](#development)
- [Testing](#testing)
- [Security](#security)
- [Contributing](#contributing)
- [Built with](#built-with)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Why this exists

If you use an MCP-aware LLM client and want to generate images from natural-language prompts, you need a local bridge between the client and the upstream image API. This server is that bridge for the **MiniMax `image-01` model**:

- Speaks MCP over **stdio** (works with any compliant client; no HTTP transport to configure)
- Validates every input with **Zod** before calling the API
- Handles **retry with exponential backoff and AWS-style full jitter** for transient errors
- Saves generated images to a directory you control, with a **configurable output-directory guard**: relative paths must stay under the process cwd, absolute paths are accepted by design, and `MINIMAX_ALLOWED_OUTPUT_ROOTS` can lock writes to an allowlist
- Reads local reference images only when explicitly passed in `subject_reference`, validates JPEG/PNG magic bytes and the 10 MB limit, and supports `MINIMAX_ALLOWED_REFERENCE_ROOTS` for read lockdowns
- Returns a **structured output** (typed, machine-readable) so LLM clients can chain tool calls reliably
- Sends optional **progress notifications** for long-running requests
- Exits **cleanly on SIGINT/SIGTERM**

## Features

- **Text-to-image** generation from a single prompt
- **Batch generation** — request up to 9 images in one call (≈8× faster than 9 separate calls at the same cost)
- **Aspect ratios** — `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16`, `21:9`
- **Explicit dimensions** — `width`/`height` (512–2048 px, divisible by 8) when exact pixels matter
- **Two models** — `image-01` (text-to-image and image-to-image) and `image-01-live` (character consistency)
- **Seed-based reproducibility** — same prompt + same seed ⇒ same image
- **Image-to-image with a character reference** — one reference image as a public URL, base64 data URL, or local JPEG/PNG path
- **Prompt optimization** — optional auto-rewriting of the prompt server-side
- **Response formats** — `base64` (recommended, persistent) or `url` (expires in 24h)
- **Inline image blocks** — results include MCP `image` content by default (`inline_images`)
- **Automatic retry** on rate-limit (1002, 60s backoff), growth-limit (2045, 30s backoff), and transient HTTP 5xx
- **Cancellation-aware** — client cancellation propagates to the upstream request and URL downloads
- **Cross-platform** — verified on Ubuntu, Windows, and macOS via the CI matrix
- **Type-safe end-to-end** — TypeScript `strict` + `noUncheckedIndexedAccess`, Zod schemas for input, response, and output

## Quickstart

```bash
# 1. Install via npm (no build step required)
npm install -g minimax-image-mcp

# 2. Get an API key from the MiniMax dashboard, then export it
export MINIMAX_API_KEY="sk-cp-your-key-here"

# 3. Smoke-test the server
node "$(npm root -g)/minimax-image-mcp/dist/index.js"
#   → stderr: "MiniMax Image MCP server running on stdio"
#   → stdout: empty (waits for MCP frames from the client)

# 4. Configure your MCP client (examples below) and start a session
```

That's it. The server speaks stdio, so any MCP client can attach to `node <npm-path>/minimax-image-mcp/dist/index.js`. See [Using via npm](#using-via-npm) for the cross-platform install path and full client configs.

## Installation

### Prerequisites

- **Node.js 18+** (Node 20 or 22 recommended; tested in CI)
- **npm 9+** (ships with Node 18+)
- A **MiniMax API key** — request one from the [MiniMax dashboard](https://api.minimax.io)

### Option A — From npm (recommended for end users)

The fastest path. No build step, no git clone. The package is published to the public npm registry as `minimax-image-mcp`.

```bash
# Global install (system-wide; recommended for MCP servers)
npm install -g minimax-image-mcp

# Verify the install
npm ls -g minimax-image-mcp
# minimax-image-mcp@1.2.0 <npm-global-path>

# Show the install path (used in your MCP client config)
npm root -g
# On Linux/macOS: /usr/local/lib/node_modules
# On Windows:    C:\Users\<you>\AppData\Roaming\npm\node_modules
```

The compiled `dist/` ships with the npm tarball, so **no build step is required** — the package is ready to run as soon as it installs.

### Option B — From source (for contributors and customization)

Use this if you want to modify the code, run the test suite, or pin to a specific unreleased commit.

```bash
git clone https://github.com/alexlivre/minimax-image-mcp.git
cd minimax-image-mcp
npm install
npm run build
```

The compiled output lives in `dist/`. Your MCP client invokes `node <repo-path>/dist/index.js`.

## Using via npm

The **recommended** way to run `minimax-image-mcp` is via the published npm package. This section explains the cross-platform install path, then shows full client configuration for the most popular MCP clients.

### 1. Install the package

```bash
npm install -g minimax-image-mcp
```

This places the package in your global `node_modules` and makes the `dist/index.js` entry point available at a known path.

### 2. Find the install path

The npm global install path differs by OS. Use `npm root -g` to discover yours:

| OS | Global install root | Path to server entry |
| --- | --- | --- |
| **Linux** | `$(npm root -g)` | `$(npm root -g)/minimax-image-mcp/dist/index.js` |
| **macOS** | `$(npm root -g)` | `$(npm root -g)/minimax-image-mcp/dist/index.js` |
| **Windows** | `%APPDATA%\npm\node_modules` | `%APPDATA%\npm\node_modules\minimax-image-mcp\dist\index.js` |

**Tip:** in the JSON examples below, replace `<npm-global-root>` with the path printed by `npm root -g` for your OS. Or use the literal path from the table.

### 3. Get an API key

Request a MiniMax API key from the [MiniMax dashboard](https://api.minimax.io). Set it in your environment before launching the MCP client:

```bash
# Linux / macOS (bash, zsh)
export MINIMAX_API_KEY="sk-cp-your-key-here"

# Windows PowerShell
$env:MINIMAX_API_KEY = "sk-cp-your-key-here"

# Windows cmd
set MINIMAX_API_KEY=sk-cp-your-key-here
```

> **Never commit this key.** The `.gitignore` covers `apikey.txt` and `.env`; rotate it immediately if you ever paste it into a file that gets pushed.

### 4. Configure your MCP client

The MCP client must spawn `node <npm-global-root>/minimax-image-mcp/dist/index.js` with `MINIMAX_API_KEY` in the environment. Below are complete configs for the most popular clients — all using the **npm-installed** path.

#### opencode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "minimax-image": {
      "type": "local",
      "command": ["node", "<npm-global-root>/minimax-image-mcp/dist/index.js"],
      "environment": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      },
      "enabled": true
    }
  }
}
```

> **Tip:** if `opencode` is the tool you use daily, you can resolve the path with shell substitution: `$(npm root -g)/minimax-image-mcp/dist/index.js`. For maximum portability across machines, paste the literal path from `npm root -g`.

#### Claude Desktop

Add to `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

**Linux / macOS:**

```json
{
  "mcpServers": {
    "minimax-image": {
      "command": "node",
      "args": ["<npm-global-root>/minimax-image-mcp/dist/index.js"],
      "env": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      }
    }
  }
}
```

**Windows** (use the Windows-specific path):

```json
{
  "mcpServers": {
    "minimax-image": {
      "command": "node",
      "args": ["%APPDATA%\\npm\\node_modules\\minimax-image-mcp\\dist\\index.js"],
      "env": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      }
    }
  }
}
```

#### Cursor

In **Cursor → Settings → MCP**, click **Add new global MCP server** and paste:

**Linux / macOS:**

```json
{
  "mcpServers": {
    "minimax-image": {
      "command": "node",
      "args": ["<npm-global-root>/minimax-image-mcp/dist/index.js"],
      "env": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      }
    }
  }
}
```

**Windows:**

```json
{
  "mcpServers": {
    "minimax-image": {
      "command": "node",
      "args": ["%APPDATA%\\npm\\node_modules\\minimax-image-mcp\\dist\\index.js"],
      "env": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      }
    }
  }
}
```

#### VS Code (with MCP extension)

In `.vscode/mcp.json` (workspace) or VS Code user settings (global):

```json
{
  "servers": {
    "minimax-image": {
      "type": "stdio",
      "command": "node",
      "args": ["<npm-global-root>/minimax-image-mcp/dist/index.js"],
      "env": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      }
    }
  }
}
```

#### Other clients

Any client that supports MCP over stdio can use this server. The contract is:

- **Spawn:** `node <path-to-server>/dist/index.js`
- **Env:** `MINIMAX_API_KEY` must be set
- **Stdio:** server speaks MCP JSON-RPC on stdout/stdin; logs go to stderr

### 5. Update later

To upgrade to a new version:

```bash
npm update -g minimax-image-mcp
# or, for major versions:
npm install -g minimax-image-mcp@latest
```

Then **restart your MCP client** so it picks up the new binary. Your config (env, paths) does not need to change.

## Configuration

The server reads **one required environment variable**:

| Variable | Required | Description |
| --- | --- | --- |
| `MINIMAX_API_KEY` | ✅ | Bearer token for the MiniMax API. **Never commit this.** |

You can also optionally set:

| Variable | Default | Description |
| --- | --- | --- |
| `MINIMAX_OUTPUT_DIR` | `./output` | Default directory when the tool omits `output_dir`. Absolute or relative (relative must stay under process cwd). |
| `MINIMAX_ALLOWED_OUTPUT_ROOTS` | — | Optional lockdown: delimiter-separated roots (`;` on Windows, `:` on Unix). When set, every resolved `output_dir` must be under one of these roots. |
| `MINIMAX_ALLOWED_REFERENCE_ROOTS` | — | Optional lockdown: delimiter-separated roots. When set, every local `subject_reference` file must be under one of these roots. |
| `MINIMAX_TIMEOUT_MS` | `60000` | Request timeout in milliseconds (`1000`–`600000`). |
| `MINIMAX_MAX_RETRIES` | `3` | Automatic retries for transient errors (`0`–`10`). |

For ready-to-use client configuration snippets (opencode, Claude Desktop, Cursor, VS Code) — including cross-platform paths for the **npm-installed** binary — see [Using via npm](#using-via-npm).

## Usage

Once the client is configured, restart it and the `minimax_image_generate` tool becomes available.

### Example: simple prompt

> "Generate a 16:9 wallpaper of a misty mountain at sunrise."

The client will call:

```json
{
  "prompt": "a misty mountain at sunrise, golden hour, cinematic",
  "aspect_ratio": "16:9"
}
```

The server returns file paths under `./output/`:

```json
{
  "id": "abc-123-def",
  "image_count": 1,
  "saved_count": 1,
  "file_paths": ["./output/misty-mountain-at-sunrise-1737000000000-1-a1b2c3d4.jpeg"]
}
```

### Example: batch with seed for reproducibility

> "Generate 4 variations of a logo concept, same seed."

```json
{
  "prompt": "minimalist fox logo, geometric, monochrome",
  "n": 4,
  "seed": 42,
  "aspect_ratio": "1:1",
  "inline_images": false
}
```

Running this twice with the same seed produces the same 4 images.

### Example: exact pixel dimensions

> "Generate a 1024×1536 portrait."

```json
{
  "prompt": "editorial portrait of a fox, studio lighting",
  "width": 1024,
  "height": 1536
}
```

`width` and `height` must be provided together, between 512 and 2048, and divisible by 8. When both are present they replace `aspect_ratio` in the upstream request.

### Example: image-to-image with character reference

```json
{
  "prompt": "the same character in a cyberpunk city at night",
  "subject_reference": [
    { "type": "character", "image_file": "https://example.com/my-character.png" }
  ]
}
```

You can also use a local file — pass an absolute path when the file is in the workspace:

```json
{
  "prompt": "the same character in a cyberpunk city at night",
  "subject_reference": [
    { "type": "character", "image_file": "C:\\art\\my-character.png" }
  ]
}
```

The reference can be a public `http(s)` URL, a base64 data URL (`data:image/jpeg;base64,...` or `data:image/png;base64,...`), or a local JPEG/PNG file under 10 MB. Local files are read by the server and converted to a data URL before the API call; relative paths must stay under the process cwd, and `MINIMAX_ALLOWED_REFERENCE_ROOTS` can lock reads to an allowlist. The API accepts one reference image per request.

## API Reference

### Tool: `minimax_image_generate`

**Input schema** (`ImageGenerateSchema` in `src/schemas.ts`):

| Parameter | Type | Required | Default | Constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `prompt` | string | ✅ | — | 1–1500 chars | Image description |
| `model` | enum | ❌ | `image-01` | `image-01`, `image-01-live` | `image-01-live` requires `subject_reference` and ignores `width`/`height` |
| `aspect_ratio` | enum | ❌ | `1:1` | one of 8 ratios | Output aspect ratio; ignored when `width` and `height` are provided |
| `width` | integer | ❌ | — | 512–2048, divisible by 8 | Explicit width in pixels; requires `height` |
| `height` | integer | ❌ | — | 512–2048, divisible by 8 | Explicit height in pixels; requires `width` |
| `n` | integer | ❌ | `1` | 1–9 | Number of images in this call |
| `seed` | uint32 | ❌ | — | 0 to 4294967295 | For reproducibility |
| `response_format` | enum | ❌ | `base64` | `base64` or `url` | `base64` recommended; URLs expire in 24h |
| `prompt_optimizer` | boolean | ❌ | `false` | — | Server-side prompt rewrite |
| `subject_reference` | array | ❌ | — | 1 item | Character reference: public `http(s)` URL, base64 data URL, or local JPEG/PNG path (under 10 MB) |
| `output_dir` | string | ❌ | `./output` | absolute path accepted; relative must stay under process cwd | Where to save the generated files. Pass an absolute workspace path to save in the project. |
| `inline_images` | boolean | ❌ | `true` | — | Attach generated images as MCP `image` content blocks. Set `false` for large batches to save context. |

**Output schema** (`ImageGenerateOutputSchema`, also returned as `structuredContent`):

```ts
{
  id: string,                  // upstream request ID
  image_count: number,         // number of images the API returned
  saved_count: number,         // number successfully written to disk
  file_paths: string[],        // absolute or relative paths to saved images
  failures?: { index: number; error: string }[],  // per-save errors (omitted on full success)
  metadata: {
    failed_count: string,      // upstream "failed_count"
    success_count: string,     // upstream "success_count"
  }
}
```

The tool result also includes the human-readable summary as a `text` block and, when `inline_images` is `true`, one MCP `image` content block per saved image (JPEG, PNG, or WebP as returned by the API).

## Error Codes

The tool returns errors as MCP error results with human-readable messages. Internally, the server distinguishes:

| Source code | Meaning | Auto-retry? |
| --- | --- | --- |
| `1000` / `1001` / `1024` / `1033` | Temporary upstream errors | ✅ exponential backoff |
| `1002` | Rate limit exceeded | ✅ 60s backoff |
| `1004` | Unauthorized (bad/missing API key) | ❌ fatal |
| `1008` | Insufficient balance | ❌ fatal |
| `1026` | Prompt blocked (sensitive input) | ❌ fatal |
| `1027` | Output blocked (sensitive content) | ❌ fatal |
| `1042` | Too many invisible/illegal characters | ❌ fatal |
| `2013` | Invalid parameters | ❌ fatal |
| `2022` / `2069` | Model unavailable or no access | ❌ fatal |
| `2045` | Growth limit reached | ✅ 30s backoff |
| `2049` | Invalid API key | ❌ fatal |
| `2053` / `2067` | Insufficient credit / auto-consumption off | ❌ fatal |
| `2056` | 5-hour quota exhausted | ❌ fatal |
| `2061` / `2068` | Plan does not support the model | ❌ fatal |
| `2062` | M Plan rate limit | ❌ fatal |
| `2064` / `2066` | Server under high load / processing timeout | ✅ 5s backoff |
| HTTP 429 | Transport rate limit | ✅ honors `Retry-After` |
| HTTP 5xx | Transport/server error | ✅ exponential backoff |
| `EMPTY_RESPONSE` | API returned success but no images | ❌ fatal (in-server error) |

MiniMax reports application errors as **HTTP 200 with a non-zero `base_resp.status_code`**, so the server validates the `base_resp` envelope before the success payload. Unknown status codes are surfaced without retrying.

The text portion of the error result always includes a **Recovery** hint when one is available (e.g. "Rate limit exceeded. Wait 60s and retry." for 1002).

## Best Practices

- **Use `n=9` for batch** — same total cost, ~8× faster than 9 separate calls.
- **Prefer `response_format='base64'`** — URLs returned by the API expire in 24 hours; base64 lets you persist indefinitely.
- **Set `inline_images=false` for large batches** — image blocks are convenient for one or two images but consume model context when repeated.
- **Use `width`/`height` when exact pixels matter** — they must be 512–2048 and divisible by 8; `aspect_ratio` is ignored when both are present.
- **Use `model='image-01-live'` only with `subject_reference`** — it is designed for character consistency and ignores explicit dimensions.
- **Set timeouts appropriately** — `n=9` can take up to ~60s end-to-end; `n=1` is typically ~16s. Tune with `MINIMAX_TIMEOUT_MS`.
- **Avoid artificial delays** between requests — the rate limiter and the client's automatic retry handle pacing.
- **Use seeds for variation grids** — request `n=4` with the same seed and slightly different prompts to get visually consistent iterations.
- **Use `prompt_optimizer` selectively** — it improves prompt quality but adds latency and may shift semantic intent. Turn it off when you need pixel-level control.

## Limitations

- **Image URLs expire in 24h** when `response_format='url'`. Use `base64` for long-term storage.
- **Rate limit:** 10 RPM officially documented, but the real bottleneck is ~16s of model latency per request.
- **No streaming** — the entire image is returned in one response. For very large batches, consider chunking manually.
- **Two models** — `image-01` and `image-01-live`. Other MiniMax image models are not exposed.
- **One reference image** — the upstream image-to-image API accepts a single character reference per request; local files are read and converted to data URLs.
- **No image editing** — this server generates new images only. Use a separate tool for inpainting or outpainting.

## Architecture

```
┌─────────────────────┐   stdio    ┌────────────────────┐   HTTPS   ┌─────────────────┐
│   MCP client        │ ◄────────► │  minimax-image-mcp │ ◄───────► │  MiniMax API    │
│  (Claude/opencode/  │    JSON     │  (this server)     │   JSON    │  (image-01)     │
│   Cursor/...)       │    RPC     │                    │           │                 │
└─────────────────────┘            └────────────────────┘           └─────────────────┘
                                            │
                                            │ writes images
                                            ▼
                                    ┌────────────────┐
                                    │  output_dir    │
                                    │  (./output)    │
                                    └────────────────┘
```

**Source layout:**

```
src/
├── index.ts       # Entry point — validates env, connects stdio transport, handles SIGINT/SIGTERM
├── server.ts      # McpServer creation, tool registration, inline images, progress notifications
├── client.ts      # MiniMaxClient — envelope validation, HTTP handling, retry with Full Jitter
├── http.ts        # Timeout- and cancellation-aware fetch helpers for text and binary bodies
├── schemas.ts     # Zod schemas (input, error envelope, response, output)
├── errors.ts      # MiniMaxApiError, MiniMaxHttpError, cancellation/timeout errors, result helpers
├── constants.ts   # API URLs, models, limits, error codes, retry delays
├── env.ts         # API key, timeout, and retry configuration from the environment
├── utils.ts       # Output/reference path guards, file saving, bounded downloads, package metadata
├── utils.test.ts  # 61 unit tests
├── client.test.ts # 24 unit tests (envelope, retry, timeout, cancellation)
├── schemas.test.ts # 36 unit tests (input/output validation)
└── server.test.ts # 21 integration tests (tool callback, inline images, failures)
```

**Request flow:**

1. `index.ts` reads `MINIMAX_API_KEY` and constructs a `MiniMaxClient`.
2. `createServer(client)` builds an `McpServer` and registers the `minimax_image_generate` tool with input/output Zod schemas.
3. The client sends an MCP `tools/call` request on stdio.
4. The server validates input (including cross-field rules), resolves `output_dir` (rejecting relative escapes), and converts local `subject_reference` files to data URLs.
5. The client sends the request with timeout and cancellation, validates the `base_resp` envelope, and retries transient failures.
6. The server saves images in parallel via `Promise.allSettled`, returns structured output, and attaches inline image blocks when enabled.
7. The server sends optional `notifications/progress` to the client if a `progressToken` was provided in the request.
8. On `SIGINT`/`SIGTERM`, the server calls `server.close()` and exits cleanly.

## Development

### Setup

```bash
git clone https://github.com/alexlivre/minimax-image-mcp.git
cd minimax-image-mcp
npm install
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript → `dist/` (production artifacts only; tests are excluded) |
| `npm run dev` | Watch mode via `tsx` (rebuilds on change) |
| `npm start` | Run the compiled server (`node dist/index.js`) |
| `npm run clean` | Remove `dist/` (cross-platform: uses `fs.rmSync`) |
| `npm test` | Run all tests once |
| `npm run test:watch` | Vitest watch mode |
| `npm run coverage` | Generate coverage report (`coverage/index.html` + JSON summary) |
| `npm run lint` | ESLint with TypeScript ESLint 9 flat config |

### Project conventions

- **Strict TypeScript.** `strict: true` + `noUncheckedIndexedAccess: true`. All public types are explicit; `any` is forbidden at boundaries.
- **Zod everywhere.** Input validation, response validation, output contract — all schemas live in `schemas.ts`.
- **No comments in code.** Code is self-documenting; the only allowed comments are JSDoc on public APIs.
- **Parameter properties for readonly fields.** See `MiniMaxClient` in `client.ts` for the canonical pattern.
- **SDK types over hand-rolled.** `errors.ts` uses `CallToolResult` from `@modelcontextprotocol/sdk/types.js` instead of redeclaring it.

## Testing

The test suite uses [Vitest](https://vitest.dev/) with `v8` coverage. The CI matrix runs on Ubuntu, Windows, and macOS, across Node 20 and Node 22 — 6 combinations total.

```bash
npm test            # 175 tests, ~1.6s
npm run coverage    # report in coverage/, thresholds enforced
```

**Coverage thresholds (enforced in CI):**

| Metric | Threshold |
| --- | --- |
| Statements | 70% |
| Branches | 60% |
| Functions | 70% |
| Lines | 70% |

Current coverage: **94.0% lines, 88.3% branches, 96.2% functions, 94.0% statements.**

## Security

See [`SECURITY.md`](./SECURITY.md) for:
- How to report vulnerabilities (we do not file public issues)
- The trust boundary model
- Best practices for users
- What this server does and does *not* do

**TL;DR for users:**

- Never commit your API key. The `.gitignore` covers `apikey.txt` and `.env`, but always double-check before `git add`.
- Use environment variables, not hardcoded values, in your MCP client config.
- Absolute `output_dir` is accepted (so agents can save into the open workspace). Relative paths must stay under the process cwd. Optional `MINIMAX_ALLOWED_OUTPUT_ROOTS` restricts all writes.
- Rotate your API key if you suspect it has been exposed.

## Contributing

Contributions are welcome! See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow, style guide, commit-message convention, and PR checklist. TL;DR:

1. Fork & clone
2. Create a feature branch
3. Make focused commits (Conventional Commits)
4. Ensure `npm run build && npm test && npm run lint && npm run coverage` all pass
5. Open a Pull Request against `main`

## License

[MIT](./LICENSE) © 2026 [Alex Santos](https://alexlivre.dev/) ([@alexlivre](https://github.com/alexlivre))

## Built with

This project was **entirely built via vibe coding** using the **MiniMax M3** AI model from [MiniMax](https://minimax.com).

- **Code generation:** Every line of source code, tests, configuration, and documentation in this repository was written by **MiniMax M3** in collaboration with a human project owner.
- **Methodology:** *Vibe coding* — the human described intent, requirements, and constraints; the AI generated, refactored, tested, and documented the implementation. The human reviewed, steered, and approved every change.
- **AI model:** [MiniMax M3](https://minimax.com) (`opencode-go/minimax-m3`), a large language model from MiniMax, a global AI foundation model company founded in 2022.
- **Image generation API:** [MiniMax](https://api.minimax.io) — the upstream `image-01` model that this MCP server wraps. (Same parent company as the AI model above; different product.)

If you want to build something similar with MiniMax M3, see the [MCP](https://modelcontextprotocol.io) and [Zod](https://zod.dev) docs — the same patterns (Zod-validated tools, stdio transport, outputSchema) compose cleanly with any domain API.

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io) — the open protocol that makes this server possible
- [MiniMax](https://api.minimax.io) — the image generation API
- [MiniMax](https://minimax.com) — the AI model and the company behind it
- [OpenCode](https://github.com/anomalyco/opencode) — the AI-powered CLI tool used to build, test, and maintain this project
- [@modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — the SDK this server is built on
- [AWS Architecture Blog — Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — the canonical reference for the retry algorithm used here
- [Zod](https://zod.dev) — runtime validation
- [Vitest](https://vitest.dev) — testing framework

## Links

- **npm package:** [minimax-image-mcp on npm](https://www.npmjs.com/package/minimax-image-mcp)
- **Source code:** [github.com/alexlivre/minimax-image-mcp](https://github.com/alexlivre/minimax-image-mcp)
- **Issue tracker:** [GitHub Issues](https://github.com/alexlivre/minimax-image-mcp/issues)
- **Releases:** [GitHub Releases](https://github.com/alexlivre/minimax-image-mcp/releases)
- **Security policy:** [SECURITY.md](./SECURITY.md)

---

<p align="center">
  Made with care for the open-source MCP community.
</p>
