# Auditoria — `minimax-image-mcp`

> **Tipo:** Code review somente leitura
> **Escopo:** `src/`, `tsconfig.json`, `package.json`, `.gitignore`
> **Build:** `npm run build` compila sem erros nem warnings (`strict: true` ativo)
> **Skill aplicada:** `mcp-builder`

---

## Resumo executivo

| Categoria | Quantidade |
| --- | --- |
| Alta prioridade | 5 |
| Média prioridade | 7 |
| Baixa prioridade | 8 |

**Top 3 por ROI / risco:**

1. **#1** — Validar resposta da API com Zod (5 linhas, blindagem total)
2. **#4** — Colisão de filename em chamadas paralelas (1 linha, evita perda de dados)
3. **#9** — Desduplicar `MAX_PROMPT_LENGTH` / `MAX_IMAGES_PER_REQUEST` (consistência)

---

## Alta prioridade

### #1. Validação fraca da resposta da API

**Arquivo:** `src/client.ts:68`

```ts
const data = (await response.json()) as ImageGenerateResponse;
```

Cast cego sem validação. Se a API mudar o schema ou retornar HTML de erro (ex: 502 do proxy), o cast passa e a quebra acontece depois, em local sem contexto. Coerente com o padrão já adotado em `schemas.ts` é usar `ImageGenerateResponseSchema.parse(data)`.

### #2. Parâmetros não documentados vazam para a API

**Arquivo:** `src/client.ts:11-21`

A interface `ImageGenerateParams` declara `width?: number` e `height?: number`, mas `ImageGenerateSchema` (input MCP) **não os expõe**. O spread `...params` em `client.ts:63` envia tudo o que estiver no objeto. Resultado: campos mortos que nunca chegam via MCP, mas ficam como bomba-relógio se algum dia forem populados. Remover da interface ou do payload.

### #3. `noUncheckedIndexedAccess` ausente

**Arquivo:** `tsconfig.json`

Com `strict: true` mas sem `noUncheckedIndexedAccess`, `images[i]` em `server.ts:90` é tipado como `string` mas em runtime pode ser `undefined`. Acessos em arrays vindos da API são exatamente onde isso fere.

### #4. Filename colide em chamadas no mesmo ms

**Arquivo:** `src/utils.ts:26-28`

```ts
const timestamp = Date.now();
const filename = `${slug}-${timestamp}-${index + 1}.jpeg`;
```

`Date.now()` tem resolução de 1ms; em batch (`n=9`) os índices 1-9 protegem, mas duas chamadas paralelas (race legítimo em MCP) colidem silenciosamente e a segunda sobrescreve a primeira. Adicionar sufixo aleatório curto ou `crypto.randomUUID().slice(0,8)`.

### #5. Path traversal não tratado

**Arquivos:** `src/utils.ts:6-8` + `src/server.ts:71`

`output_dir` é aceito como string livre do MCP. Caminhos tipo `C:\Windows\System32` são aceitos sem validação. A ferramenta não deveria escrever fora de um allowlist. Recomendações:

- Resolver para absoluto e validar que está dentro de `cwd` ou de `MINIMAX_OUTPUT_DIR` base.
- Ou exigir que o diretório pré-exista e tenha permissão do usuário.

---

## Média prioridade

### #6. Retry sem jitter

**Arquivo:** `src/client.ts:97`

```ts
await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
```

Backoff determinístico (1s, 2s, 3s) provoca thundering-herd se vários clients MCP reiniciarem juntos. Adicionar jitter ±30% (prática padrão para backoff exponencial).

### #7. `mkdir` chamado N vezes

**Arquivo:** `src/utils.ts:24` invocado por `src/server.ts:89-92`

Para `n=9`, `mkdir(recursive)` executa 9× sobre o mesmo diretório. Hoistar para o caller (uma chamada antes do loop) — economia real de syscalls e o intent fica explícito.

### #8. Escritas sequenciais em batch

**Arquivo:** `src/server.ts:89-92`

O loop `for` com `await` salva imagens uma a uma. `Promise.all` paraleliza I/O de disco. Ganho pequeno em SSD, mas mais importante: signaliza intenção de batch.

### #9. Constantes duplicadas entre `schemas.ts` e `constants.ts`

- `MAX_PROMPT_LENGTH = 1500` existe em `constants.ts:6` mas `schemas.ts:8` usa literal `1500`.
- `MAX_IMAGES_PER_REQUEST = 9` existe em `constants.ts:7` mas `schemas.ts:24` usa literal `9`.
- `CHARACTER_LIMIT = 25000` em `constants.ts:9` nunca é usado.

DRY violation. Os literais do Zod devem referenciar as constantes (ou as constantes serem derivadas dos schemas via inferência).

### #10. `seed` sem range

**Arquivo:** `src/schemas.ts:30-36`

`z.number().int()` aceita qualquer inteiro (incluindo negativos e valores absurdos). A API costuma exigir `[0, 2^32-1]`. Validar com `.min(0).max(4294967295)`.

### #11. Sem `outputSchema` na tool

**Arquivo:** `src/server.ts:51-68`

O SDK suporta declarar `outputSchema` + retornar `structuredContent` (que o código já faz em `server.ts:103-108`). Sem o schema declarado, clientes MCP não conseguem validar a estrutura. Subutilização do recurso.

### #12. Sem progress notifications

**Arquivo:** `src/server.ts:69-113`

Para `n=9` (latência ~60-90s), o cliente fica às cegas. O SDK expõe `server.notification({...})` e o protocolo suporta `notifications/progress`. UX consideravelmente melhor com um único update "Processing 3/9..." durante a geração.

---

## Baixa prioridade / polimento

### #13. Tipos manuais replicando o SDK

**Arquivo:** `src/errors.ts:31-34, 57-60`

As assinaturas `toErrorResult` e `toTextResult` reinventam `CallToolResult` à mão. Usar `import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"` mantém sincronia com versões do SDK.

### #14. `readPackageMetadata` no lugar errado

**Arquivo:** `src/server.ts:9-21`

Função utilitária dentro de `server.ts` mas pertence a `utils.ts` (ou a um `meta.ts`). Os fallbacks `"minimax-image-mcp"` / `"1.0.0"` nas linhas 14 e 19 são duplicados — o `catch` pode simplesmente retornar o objeto fallback uma vez.

### #15. Default values hardcoded

**Arquivo:** `src/schemas.ts:15, 40`

`default("1:1")` e `default("base64")` usam literais. Promover a `DEFAULT_ASPECT_RATIO` / `DEFAULT_RESPONSE_FORMAT` em `constants.ts` para evitar drift quando a API ganhar novas opções.

### #16. `private` sem `readonly`

**Arquivo:** `src/client.ts:40-45`

`apiKey` e `timeout` não mudam após construção. `private readonly` expressa a invariante e o compilador protege contra mutação acidental.

### #17. Texto de erro hardcoded em português

**Arquivo:** `src/server.ts:85`

```ts
new Error("API retornou sucesso mas sem imagens")
```

Mistura idioma da mensagem com código de runtime e perde contexto. Criar `EmptyResponseError` ou usar um código semântico (`{ code: "EMPTY_RESPONSE" }`).

### #18. Ausência de README / scripts de test e lint

**Arquivo:** `package.json`

Sem `"test"` ou `"lint"`. Sem `README.md`. Para um servidor publicado/distribuído, falta documentação humana — `AGENTS.md` cobre apenas contexto para agentes.

### #19. Sem graceful shutdown

**Arquivo:** `src/index.ts`

Não há handler de `SIGINT`/`SIGTERM`. Em produção (sessões longas), o processo pode ser morto antes de drenar logs ou fechar handles.

### #20. `sanitizeFilename` produz slug vazio

**Arquivo:** `src/utils.ts:10-16`

Para prompt só com emojis ou só com acentos (ex: `"áéíóú"`), o resultado é `""` (após o strip). O arquivo vira `-1737000000-1.jpeg`. Fallback para `"image"` quando `slug === ""`.

---

## Boas práticas já adotadas (manter)

- `strict: true` no `tsconfig.json`
- `forceConsistentCasingInFileNames` ativo
- `.gitignore` cobre `apikey.txt`, `output/`, `dist/`, `.env` corretamente
- Tratamento de erros com classe dedicada (`MiniMaxApiError`) e mensagens de recuperação por código
- `instructions` ricas e bem formatadas no `McpServer`
- `annotations` corretas (`readOnlyHint`, `idempotentHint`, `openWorldHint`, `openWorldHint`)
- Transport `stdio` (adequado ao registrar em `opencode.json` local)
