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
                          └→ writes images to disk (output_dir)
```

### Trust Boundaries

- **API key (`MINIMAX_API_KEY`)** — Bearer token. Treated as a secret; never logged, never written to disk, never returned in error messages. Loaded only from environment variables.
- **Output directory** — server writes JPEG files to `output_dir` (default `./output/`). The path is validated to prevent traversal outside the working directory (or `MINIMAX_OUTPUT_DIR` base).
- **Stdout** — used **only** for MCP protocol frames. Stderr is used for diagnostic logs. Never write secrets to either.
- **Network** — only outbound HTTPS to `api.minimax.io`. No inbound network.

### What This Server Does NOT Do

- Does not store or cache API keys
- Does not make outbound requests to any host other than `api.minimax.io`
- Does not execute user-supplied code
- Does not read files outside `output_dir` (and even there, only writes)
- Does not modify system state outside the configured `output_dir`

## Security Best Practices for Users

1. **Never commit your API key.** The `.gitignore` covers `apikey.txt` and `.env`, but always double-check before `git add`.
2. **Use environment variables**, not hardcoded values, when configuring the MCP client.
3. **Restrict `output_dir`** to a directory you control. The server rejects paths outside `cwd` (or `MINIMAX_OUTPUT_DIR`) to prevent accidental writes to system locations.
4. **Rotate your API key** if you suspect it has been exposed. The MiniMax dashboard allows key revocation.
5. **Run on trusted hosts only.** This server has full filesystem write access to `output_dir` on the host it runs on.
6. **Review `subject_reference` URLs** before passing them — they must be HTTPS URLs to image files. The server does not fetch them, but the upstream API does.
7. **Keep the server updated.** Subscribe to releases for security patches.

## Known Security Considerations

- **No request signing** — the API key is sent in the `Authorization` header over HTTPS. This is the upstream API's authentication model; we do not augment it.
- **Stdout MCP traffic** — if the host's stdio is being captured by a third party, tool inputs and outputs (including image data) are visible. Use a trusted MCP client.
- **Image file permissions** — images are saved with default umask (typically 0644 on Unix, inherited ACLs on Windows). If you need stricter permissions, configure the host filesystem accordingly.

## Acknowledgments

We thank the security researchers and contributors who report vulnerabilities responsibly. Credit will be given in release notes (with your permission) when a fix is shipped.
