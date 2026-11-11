# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

We take all security reports seriously. To report a vulnerability:

1. **Email:** Send details to `alexbreno2005@gmail.com` (the maintainer's GitHub-verified email).
2. **Subject prefix:** `[SECURITY] minimax-image-mcp`
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
   - Your name/handle for credit (optional)

You should receive an acknowledgment within 72 hours. We will follow up with a timeline for a fix and coordinate disclosure.

## What to Expect

- **Acknowledgment** within 72 hours of your report
- **Status update** within 7 days
- **Fix and disclosure** coordinated with you, typically within 30 days for moderate-to-high severity issues
- **CVE** will be requested for confirmed vulnerabilities with broad impact

## Security Model

This MCP server is a **thin client** to the MiniMax image generation API. The security boundary is:

```
[MCP client]  ←stdio→  [this server]  ←HTTPS→  [MiniMax API]
                          │
                          ├→ writes images to disk (output_dir)
                          └→ reads local reference images (subject_reference)
```

### Trust Boundaries

- **API key (`MINIMAX_API_KEY`)** — Bearer token. Treated as a secret; never logged, never written to disk, never returned in error messages. Loaded only from environment variables.
- **Output directory** — server writes image files to `output_dir` (default `./output/`). Absolute paths are accepted. Relative paths must stay under the process cwd. Optional `MINIMAX_ALLOWED_OUTPUT_ROOTS` restricts all writes to listed roots.
- **Reference images** — when a local path is passed in `subject_reference`, the server reads that file once, validates JPEG/PNG magic bytes and the 10 MB limit, and converts it to a data URL. Relative paths must stay under the process cwd. Optional `MINIMAX_ALLOWED_REFERENCE_ROOTS` restricts all reads to listed roots.
- **Stdout** — used **only** for MCP protocol frames. Stderr is used for diagnostic logs. Never write secrets to either.
- **Network** — only outbound HTTPS to `api.minimax.io`. No inbound network.

### What This Server Does NOT Do

- Does not store or cache API keys
- Does not make outbound requests to any host other than `api.minimax.io`
- Does not execute user-supplied code
- Does not read arbitrary files: it writes to `output_dir` and reads only the local JPEG/PNG files explicitly passed in `subject_reference`
- Does not modify system state outside the configured `output_dir`

## Security Best Practices for Users

1. **Never commit your API key.** The `.gitignore` covers `apikey.txt` and `.env`, but always double-check before `git add`.
2. **Use environment variables**, not hardcoded values, when configuring the MCP client.
3. **Restrict writes if needed** with `MINIMAX_ALLOWED_OUTPUT_ROOTS` (delimiter-separated roots). Relative `output_dir` values are already sandboxed to the process cwd; absolute paths are accepted by default so agents can save into the open workspace.
4. **Rotate your API key** if you suspect it has been exposed. The MiniMax dashboard allows key revocation.
5. **Run on trusted hosts only.** This server has full filesystem write access to `output_dir` on the host it runs on.
6. **Review `subject_reference` inputs** — they may be HTTPS URLs, data URLs, or local JPEG/PNG paths. Use `MINIMAX_ALLOWED_REFERENCE_ROOTS` to restrict which local directories can be read. The server does not fetch URL references; the upstream API does.
7. **Keep the server updated.** Subscribe to releases for security patches.

## Known Security Considerations

- **No request signing** — the API key is sent in the `Authorization` header over HTTPS. This is the upstream API's authentication model; we do not augment it.
- **Stdout MCP traffic** — if the host's stdio is being captured by a third party, tool inputs and outputs (including image data) are visible. Use a trusted MCP client.
- **Image file permissions** — images are saved with default umask (typically 0644 on Unix, inherited ACLs on Windows). If you need stricter permissions, configure the host filesystem accordingly.

## Acknowledgments

We thank the security researchers and contributors who report vulnerabilities responsibly. Credit will be given in release notes (with your permission) when a fix is shipped.
