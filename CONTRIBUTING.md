# Contributing to minimax-image-mcp

Thank you for your interest in contributing! This project is an open-source MCP server, and contributions of all kinds are welcome.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Style Guide](#style-guide)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

Be respectful, inclusive, and constructive. Disagreements about implementation are normal and welcome; personal attacks are not.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/minimax-image-mcp.git
   cd minimax-image-mcp
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Set up** the environment:
   ```bash
   export MINIMAX_API_KEY="sk-cp-your-test-key"
   ```
   You can obtain a test key from the MiniMax dashboard. Never commit this key.
5. **Verify** your setup:
   ```bash
   npm run build
   npm test
   ```

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make focused commits (see [Commit Messages](#commit-messages) below).
3. Keep the build green: `npm run build && npm test && npm run lint` must pass before requesting review.
4. Update relevant docs (`README.md`, `AGENTS.md`, `ANALYSIS.md`) if your change affects the public surface.
5. Push your branch and open a Pull Request against `main`.

## Testing

This project uses [Vitest](https://vitest.dev/) with `v8` coverage. The CI matrix runs on Ubuntu, Windows, and macOS.

```bash
npm test                # run all tests once
npm run test:watch      # watch mode during development
npm run coverage        # generate coverage report in coverage/
```

### Adding Tests

- Tests live in `src/**/*.test.ts` and run on every PR.
- Aim for ≥ 90% statement coverage for new code; CI enforces ≥ 70% lines/functions/statements and ≥ 60% branches.
- For the `MiniMaxClient` retry logic, use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync()` to test backoff deterministically.
- For the server tool callback, mock `McpServer` and `node:fs/promises` to keep tests hermetic.
- See `src/server.test.ts` for a working example of `vi.hoisted` mock factories.

## Style Guide

- **TypeScript strict** — the project compiles with `strict: true` and `noUncheckedIndexedAccess: true`. Do not relax these.
- **No comments** — code is self-documenting; the only acceptable comments are JSDoc on public APIs.
- **ESLint** — `npm run lint` must pass without warnings.
- **EditorConfig** — see `.editorconfig`; 2-space indent, LF line endings, UTF-8.
- **Cross-platform** — code must work on Windows, macOS, and Linux. Use `node:path` and `path.sep`; avoid `rm`, `cp`, `mv` shell commands.
- **Zod for input validation** — every tool input must have a Zod schema in `schemas.ts`.
- **Error subclasses** — prefer named error classes over string codes (see `EmptyResponseError` in `errors.ts`).

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

<optional body>

<optional footer>
```

Types:
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or correcting tests
- `chore` — build, CI, or tooling changes
- `perf` — performance improvement

Examples:
```
feat(client): add jitter to retry backoff
fix(utils): sanitize empty prompt slug
docs: add SECURITY.md disclosure policy
```

## Pull Request Process

1. **Title** — follow Conventional Commits format.
2. **Description** — explain *what* and *why*. Link any related issues with `Closes #123` or `Refs #456`.
3. **Checklist** — confirm:
   - [ ] `npm run build` passes
   - [ ] `npm test` passes (all 72+ tests)
   - [ ] `npm run coverage` meets thresholds
   - [ ] `npm run lint` passes
   - [ ] Public APIs are documented in `README.md` or `AGENTS.md`
   - [ ] No secrets, API keys, or PII are committed
4. **Reviews** — at least one maintainer approval required before merge.
5. **CI** — all 6 matrix jobs (3 OS × 2 Node) must be green.

## Reporting Bugs

Open a [GitHub Issue](https://github.com/alexlivre/minimax-image-mcp/issues) with:

- **Summary** — one-sentence description
- **Steps to reproduce** — minimal sequence
- **Expected behavior** — what should happen
- **Actual behavior** — what does happen
- **Environment** — Node version, OS, MCP client (Claude Desktop, opencode, Cursor, etc.)
- **Logs** — relevant stderr/stdout (redact any API keys first)

## Suggesting Features

Open an issue with the `enhancement` label. Describe:

- The problem you're trying to solve
- Your proposed solution
- Alternatives you've considered
- Any breaking-change implications

## Security Issues

**Do not file public issues for security vulnerabilities.** See [`SECURITY.md`](./SECURITY.md) for responsible disclosure.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
