# minimax-image-mcp

> A Model Context Protocol (MCP) server that wraps the [MiniMax](https://api.minimax.io) image generation API. Exposes a single tool, `minimax_image_generate`, that any MCP-compatible client (Claude Desktop, opencode, Cursor, etc.) can call to generate images from text prompts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen)](https://nodejs.org)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/alexlivre/minimax-image-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/alexlivre/minimax-image-mcp/actions)
[![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen)](./vitest.config.ts)

---

## Table of Contents

- [Why this exists](#why-this-exists)
- [Features](#features)
- [Quickstart](#quickstart)
- [Installation](#installation)
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
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Why this exists

If you use an MCP-aware LLM client and want to generate images from natural-language prompts, you need a local bridge between the client and the upstream image API. This server is that bridge for the **MiniMax `image-01` model**:

- Speaks MCP over **stdio** (works with any compliant client; no HTTP transport to configure)
- Validates every input with **Zod** before calling the API
- Handles **retry with exponential backoff and AWS-style full jitter** for transient errors
- Saves generated images to a directory you control, with a **strict path-traversal guard**
- Returns a **structured output** (typed, machine-readable) so LLM clients can chain tool calls reliably
- Sends optional **progress notifications** for long-running requests
- Exits **cleanly on SIGINT/SIGTERM**

## Features

- **Text-to-image** generation from a single prompt
- **Batch generation** — request up to 9 images in one call (≈8× faster than 9 separate calls at the same cost)
- **Aspect ratios** — `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16`, `21:9`
- **Seed-based reproducibility** — same prompt + same seed ⇒ same image
- **Image-to-image with character references** — pass 1–5 reference image URLs
- **Prompt optimization** — optional auto-rewriting of the prompt server-side
- **Response formats** — `base64` (recommended, persistent) or `url` (expires in 24h)
- **Automatic retry** on rate-limit (1002, 60s backoff) and growth-limit (2045, 30s backoff) errors
- **Cross-platform** — verified on Ubuntu, Windows, and macOS via the CI matrix
- **Type-safe end-to-end** — TypeScript `strict` + `noUncheckedIndexedAccess`, Zod schemas for input, Zod schemas for response

## Quickstart

```bash
# 1. Install
git clone https://github.com/alexlivre/minimax-image-mcp.git
cd minimax-image-mcp
npm install
npm run build

# 2. Get an API key from the MiniMax dashboard, then export it
export MINIMAX_API_KEY="sk-cp-your-key-here"

# 3. Smoke-test the server
node dist/index.js
#   → stderr: "MiniMax Image MCP server running on stdio"
#   → stdout: empty (waits for MCP frames from the client)

# 4. Configure your MCP client (example for opencode below) and start a session
```

That's it. The server speaks stdio, so any MCP client can attach to `node dist/index.js`.

## Installation

### Prerequisites

- **Node.js 18+** (Node 20 or 22 recommended; tested in CI)
- **npm 9+** (ships with Node 18+)
- A **MiniMax API key** — request one from the [MiniMax dashboard](https://api.minimax.io)

### From source (recommended for now)

```bash
git clone https://github.com/alexlivre/minimax-image-mcp.git
cd minimax-image-mcp
npm install
npm run build
```

The compiled output lives in `dist/`. Your MCP client invokes `node <path>/dist/index.js`.

### (Future) From npm

```bash
npm install -g minimax-image-mcp
```

Not yet published. Track [issue #X](https://github.com/alexlivre/minimax-image-mcp/issues) for progress.

## Configuration

The server reads **one environment variable**:

| Variable | Required | Description |
| --- | --- | --- |
| `MINIMAX_API_KEY` | ✅ | Bearer token for the MiniMax API. **Never commit this.** |

You can also optionally set:

| Variable | Default | Description |
| --- | --- | --- |
| `MINIMAX_OUTPUT_DIR` | `./output` | Base directory for saved images. The `output_dir` tool parameter is resolved relative to this (or, if absolute, must be inside this path). |

### MCP client configuration

#### opencode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "minimax-image": {
      "type": "local",
      "command": ["node", "/absolute/path/to/minimax-image-mcp/dist/index.js"],
      "environment": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      },
      "enabled": true
    }
  }
}
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "minimax-image": {
      "command": "node",
      "args": ["/absolute/path/to/minimax-image-mcp/dist/index.js"],
      "env": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      }
    }
  }
}
```

#### Cursor

In **Cursor → Settings → MCP**, click **Add new global MCP server** and paste:

```json
{
  "mcpServers": {
    "minimax-image": {
      "command": "node",
      "args": ["/absolute/path/to/minimax-image-mcp/dist/index.js"],
      "env": {
        "MINIMAX_API_KEY": "sk-cp-your-key-here"
      }
    }
  }
}
```

#### Other clients

Any client that supports MCP over stdio can use this server. The contract is simple: spawn `node <path>/dist/index.js` with `MINIMAX_API_KEY` in the environment, and the server will speak MCP on stdio.

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
  "aspect_ratio": "1:1"
}
```

Running this twice with the same seed produces the same 4 images.

### Example: image-to-image with character reference

```json
{
  "prompt": "the same character in a cyberpunk city at night",
  "subject_reference": [
    { "type": "character", "image_file": "https://example.com/my-character.png" }
  ]
}
```

## API Reference

### Tool: `minimax_image_generate`

**Input schema** (`ImageGenerateSchema` in `src/schemas.ts`):

| Parameter | Type | Required | Default | Constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `prompt` | string | ✅ | — | 1–1500 chars | Image description |
| `aspect_ratio` | enum | ❌ | `1:1` | one of 8 ratios | Output aspect ratio |
| `n` | integer | ❌ | `1` | 1–9 | Number of images in this call |
| `seed` | uint32 | ❌ | — | 0 to 4294967295 | For reproducibility |
| `response_format` | enum | ❌ | `base64` | `base64` or `url` | `base64` recommended; URLs expire in 24h |
| `prompt_optimizer` | boolean | ❌ | `false` | — | Server-side prompt rewrite |
| `subject_reference` | array | ❌ | — | 1–5 items | Character reference image URLs (HTTPS) |
| `output_dir` | string | ❌ | `./output` | absolute path inside `MINIMAX_OUTPUT_DIR` or `cwd` | Where to save the generated files |

**Output schema** (`ImageGenerateOutputSchema`):

```ts
{
  id: string,                  // upstream request ID
  image_count: number,         // number of images the API returned
  saved_count: number,         // number successfully written to disk
  file_paths: string[],        // absolute or relative paths to saved JPEGs
  failures?: { index: number; error: string }[],  // per-save errors (omitted on full success)
  metadata: {
    failed_count: string,      // upstream "failed_count" (string per API)
    success_count: string,     // upstream "success_count"
  }
}
```

## Error Codes

The tool returns errors as MCP error results with human-readable messages. Internally, the server distinguishes:

| Source code | Meaning | Auto-retry? |
| --- | --- | --- |
| `1002` | Rate limit exceeded | ✅ 60s backoff |
| `1004` | Unauthorized (bad/missing API key) | ❌ fatal |
| `1008` | Insufficient balance | ❌ fatal |
| `1026` | Prompt blocked (sensitive input) | ❌ fatal |
| `1027` | Output blocked (sensitive content) | ❌ fatal |
| `2045` | Growth limit reached | ✅ 30s backoff |
| `2049` | Invalid API key | ❌ fatal |
| `2056` | 5-hour quota exhausted | ❌ fatal |
| `EMPTY_RESPONSE` | API returned success but no images | ❌ fatal (in-server error) |

The text portion of the error result always includes a **Recovery** hint when one is available (e.g. "Aguarde 60s e tente novamente" for 1002).

## Best Practices

- **Use `n=9` for batch** — same total cost, ~8× faster than 9 separate calls.
- **Prefer `response_format='base64'`** — URLs returned by the API expire in 24 hours; base64 lets you persist indefinitely.
- **Set timeouts appropriately in your MCP client** — `n=9` can take up to ~60s end-to-end; `n=1` is typically ~16s.
- **Avoid artificial delays** between requests — the rate limiter and the client's automatic retry handle pacing.
- **Use seeds for variation grids** — request `n=4` with the same seed and slightly different prompts to get visually consistent iterations.
- **Use `prompt_optimizer` selectively** — it improves prompt quality but adds latency and may shift semantic intent. Turn it off when you need pixel-level control.

## Limitations

- **Image URLs expire in 24h** when `response_format='url'`. Use `base64` for long-term storage.
- **Rate limit:** 10 RPM officially documented, but the real bottleneck is ~16s of model latency per request.
- **No streaming** — the entire image is returned in one response. For very large batches, consider chunking manually.
- **Single model** — only `image-01` is supported. Adding models is a future enhancement.
- **No image editing** — this server generates new images only. Use a separate tool for inpainting or outpainting.

## Architecture

```
┌─────────────────────┐   stdio    ┌────────────────────┐   HTTPS   ┌─────────────────┐
│   MCP client        │ ◄────────► │  minimax-image-mcp │ ◄───────► │  MiniMax API    │
│  (Claude/opencode/  │    JSON     │  (this server)     │   JSON    │  (image-01)     │
│   Cursor/...)       │    RPC     │                    │           │                 │
└─────────────────────┘            └────────────────────┘           └─────────────────┘
                                            │
                                            │ writes JPEGs
                                            ▼
                                    ┌────────────────┐
                                    │  output_dir    │
                                    │  (./output)    │
                                    └────────────────┘
```

**Source layout:**

```
src/
├── index.ts      # Entry point — validates env, connects stdio transport, handles SIGINT/SIGTERM
├── server.ts     # McpServer creation, tool registration, output schema, progress notifications
├── client.ts     # MiniMaxClient — fetch + retry with Full Jitter (AWS)
├── schemas.ts    # Zod schemas (input, response, output)
├── errors.ts     # MiniMaxApiError, EmptyResponseError, toErrorResult, toTextResult
├── constants.ts  # API URLs, error codes, retry delays
├── utils.ts      # Output directory resolution (path-traversal guarded), file saving, package metadata
├── utils.test.ts # 25 unit tests
├── client.test.ts # 13 unit tests (retry, jitter, exhaustion)
├── schemas.test.ts # 22 unit tests (input/output validation)
└── server.test.ts # 12 integration tests (tool callback, progress, failures)
```

**Request flow:**

1. `index.ts` reads `MINIMAX_API_KEY` and constructs a `MiniMaxClient`.
2. `createServer(client)` builds an `McpServer` and registers the `minimax_image_generate` tool with input/output Zod schemas.
3. The client sends an MCP `tools/call` request on stdio.
4. The server validates input, resolves `output_dir` (rejecting traversal), calls `client.generateImage(...)`, saves images in parallel via `Promise.allSettled`, and returns a structured result.
5. The server sends optional `notifications/progress` to the client if a `progressToken` was provided in the request.
6. On `SIGINT`/`SIGTERM`, the server calls `server.close()` and exits cleanly.

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
npm test            # 72 tests, ~1.4s
npm run coverage    # report in coverage/, thresholds enforced
```

**Coverage thresholds (enforced in CI):**

| Metric | Threshold |
| --- | --- |
| Statements | 70% |
| Branches | 60% |
| Functions | 70% |
| Lines | 70% |

Current coverage: **90% lines, 83% branches, 89% functions, 90% statements.**

## Security

See [`SECURITY.md`](./SECURITY.md) for:
- How to report vulnerabilities (we do not file public issues)
- The trust boundary model
- Best practices for users
- What this server does and does *not* do

**TL;DR for users:**

- Never commit your API key. The `.gitignore` covers `apikey.txt` and `.env`, but always double-check before `git add`.
- Use environment variables, not hardcoded values, in your MCP client config.
- The server rejects `output_dir` paths outside `cwd` (or `MINIMAX_OUTPUT_DIR`) to prevent accidental writes to system locations.
- Rotate your API key if you suspect it has been exposed.

## Contributing

Contributions are welcome! See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow, style guide, commit-message convention, and PR checklist. TL;DR:

1. Fork & clone
2. Create a feature branch
3. Make focused commits (Conventional Commits)
4. Ensure `npm run build && npm test && npm run lint && npm run coverage` all pass
5. Open a Pull Request against `main`

## License

[MIT](./LICENSE) © 2026 Alex Breno

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io) — the open protocol that makes this server possible
- [MiniMax](https://api.minimax.io) — the image generation API
- [@modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — the SDK this server is built on
- [AWS Architecture Blog — Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — the canonical reference for the retry algorithm used here
- [Zod](https://zod.dev) — runtime validation
- [Vitest](https://vitest.dev) — testing framework

---

<p align="center">
  Made with care for the open-source MCP community.
</p>
