# AGENTS.md

## What this is

TypeScript MCP server wrapping MiniMax's `image-01` image generation API. Single tool: `minimax_image_generate`.

## Quick commands

```bash
npm run build      # compile TypeScript → dist/
npm run dev        # watch mode with tsx
npm start          # run compiled server (requires MINIMAX_API_KEY)
```

**Always `npm run build` before testing.** The MCP client loads `dist/index.js`, not source.

## Required env

- `MINIMAX_API_KEY` — Bearer token for MiniMax API. Set in `opencode.json` under `environment`.

## Architecture

```
src/
├── index.ts      # Entry point, validates env, connects stdio transport
├── server.ts     # McpServer creation, tool registration
├── client.ts     # MiniMaxClient — fetch + retry logic
├── schemas.ts    # Zod input validation
├── errors.ts     # MiniMaxApiError, toErrorResult, toTextResult
├── constants.ts  # API URLs, error codes, retry delays
└── utils.ts      # Output directory, file saving
```

Flow: `index.ts` → `createServer(client)` → `server.connect(StdioServerTransport)`

## Key facts

- **API endpoint:** `POST https://api.minimax.io/v1/image_generation`
- **Model:** `image-01` (hardcoded in `constants.ts`)
- **Transport:** stdio (not HTTP)
- **Images saved to:** `./output/` by default (override via `output_dir` param or `MINIMAX_OUTPUT_DIR` env)
- **Rate limit:** 10 RPM official, but real bottleneck is ~16s latency per request
- **Retry:** errors 1002 (60s backoff) and 2045 (30s backoff) are retried automatically; 1004/2049/2056/1026/1027 are fatal

## API quirks worth knowing

- `response_format: "base64"` recommended — URLs expire in 24h
- `n=9` is 8× faster than 9 separate calls, same cost
- Prompt max: 1500 characters
- Aspect ratios: `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16`, `21:9`

## opencode.json config

The MCP is registered as `minimax-image` in `~/.config/opencode/opencode.json`:

```json
"minimax-image": {
  "type": "local",
  "command": ["node", "C:\\code\\mcp-servers\\minimax-image-mcp\\dist\\index.js"],
  "environment": {
    "MINIMAX_API_KEY": "sk-cp-..."
  },
  "enabled": true
}
```

## Testing locally

```bash
# Build first
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js

# Or test directly
$env:MINIMAX_API_KEY="your-key"; node dist/index.js
```
