# Problema: salvar imagens direto no workspace do Cursor

**Status: resolvido** (2026-07-31)

Documento de contexto histórico. A allowlist antiga usava o `cwd` do processo MCP (não o workspace do Cursor), então paths absolutos do projeto eram rejeitados e o agente gravava no default e copiava depois.

## Correção

`resolveOutputDir` agora:

1. Aceita **paths absolutos** (ex.: workspace do usuário).
2. Mantém sandbox só em **paths relativos** (devem ficar sob `process.cwd()`).
3. Oferece lockdown opcional via `MINIMAX_ALLOWED_OUTPUT_ROOTS`.
4. `MINIMAX_OUTPUT_DIR` é só o default quando `output_dir` não é passado.

INSTRUCTIONS do MCP orientam o agente a passar `output_dir` absoluto do workspace e não copiar depois.

## Referências

- `src/utils.ts` — `resolveOutputDir`, `isPathInside`
- `src/utils.test.ts` — testes de absoluto / relativo / roots
- `README.md` / `SECURITY.md` / `AGENTS.md`
