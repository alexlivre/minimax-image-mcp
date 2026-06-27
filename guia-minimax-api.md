# Guia Completo — API MiniMax

**Versão:** 1.0 | **Data:** 2026-06-13

> Guia unificado baseado em testes práticos contra a API real da MiniMax.
> Documentação oficial: [platform.minimax.io/docs](https://platform.minimax.io/docs/llms.txt)

---

## Índice

- [Parte I: Texto (LLMs)](#parte-i-texto-llms)
- [Parte II: Imagem (`image-01`)](#parte-ii-imagem-image-01)
- [Parte III: Áudio *(em breve)*](#parte-iii-audio-em-breve)

---

# Parte I: Texto (LLMs)

**Endpoint (Anthropic):** `POST https://api.minimax.io/anthropic/v1/messages`
**Endpoint (OpenAI):** `POST https://api.minimax.io/v1/chat/completions`
**Modelos:** `MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.5`, `MiniMax-M2.1`, `MiniMax-M2` (+ highspeed)

| Resumo dos Testes | |
|---|---|---|
| Total de testes | **34** |
| Aprovação | **100%** |
| Cobertura | Anthropic, OpenAI, streaming, tool use, caching, multimodal, `<think>`, performance/TPS |

---

## 1. Visão Geral

A MiniMax oferece LLMs compatíveis com as APIs **Anthropic** e **OpenAI**. O modelo principal é o **MiniMax-M3**, com **1 milhão de tokens** de contexto, suporte a tool use, interleaved thinking, multimodal (texto, imagem, vídeo) e prompt caching.

### Destaques

- M3: 1M de contexto, thinking adaptável, multimodal
- M2.x: 204k de contexto, thinking sempre ativo, texto + tool use
- Compatibilidade total com SDKs Anthropic e OpenAI
- Caching automático (passive) e explícito (cache_control)
- Interleaved Thinking em tool use (raciocínio entre cada chamada de ferramenta)

---

## 2. Setup Rápido

### 2.1 Dependências

```bash
pip install anthropic openai python-dotenv
```

### 2.2 Arquivo `.env`

```env
MINIMAX_API_KEY=sk-cp-...sua-chave...
```

### 2.3 Estrutura de diretórios sugerida

```
projeto/
├── .env
├── .gitignore
├── requirements.txt
├── src/
│   ├── config.py              # Carrega .env, URLs, constantes
│   ├── anthropic_client.py    # Chamadas Anthropic
│   ├── openai_client.py       # Chamadas OpenAI
│   ├── streaming.py           # Streaming (ambos SDKs)
│   ├── tool_use.py            # Function calling
│   ├── caching.py             # Prompt caching
│   └── multimodal.py          # Imagem/vídeo
└── tests/
    └── test_*.py              # Testes automatizados
```

### 2.4 `.gitignore`

```
.env
.venv/
__pycache__/
*.pyc
.pytest_cache/
```

---

## 3. Modelos e Parâmetros

### 3.1 Modelos Suportados

| Modelo | Contexto | Thinking | Multimodal | Velocidade (oficial) | Testado |
|---|---|---|---|---|---|---|
| **MiniMax-M3** | 1,000,000 | Adaptive | Imagem + Vídeo | ~60 tps | ✅ |
| MiniMax-M2.7 | 204,800 | Sempre ativo | Não | ~60 tps | ✅ |
| MiniMax-M2.7-highspeed | 204,800 | Sempre ativo | Não | ~100 tps | ✅ |
| MiniMax-M2.5 | 204,800 | Sempre ativo | Não | ~60 tps | ❌ |
| MiniMax-M2.5-highspeed | 204,800 | Sempre ativo | Não | ~100 tps | ❌ |
| MiniMax-M2.1 | 204,800 | Sempre ativo | Não | ~60 tps | ❌ |
| MiniMax-M2.1-highspeed | 204,800 | Sempre ativo | Não | ~100 tps | ❌ |
| MiniMax-M2 | 204,800 | Sempre ativo | Não | - | ❌ |

### 3.2 Corpo da Requisição — Anthropic

```json
{
  "model": "MiniMax-M3",
  "max_tokens": 1000,
  "system": "You are a helpful assistant.",
  "messages": [
    {"role": "user", "content": "Hi, how are you?"}
  ],
  "thinking": {"type": "adaptive"},
  "stream": false,
  "temperature": 1.0
}
```

### 3.3 Corpo da Requisição — OpenAI

```json
{
  "model": "MiniMax-M3",
  "max_tokens": 1000,
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hi, how are you?"}
  ],
  "extra_body": {
    "reasoning_split": true,
    "thinking": {"type": "adaptive"}
  }
}
```

### 3.4 Tabela de Parâmetros — Anthropic

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `model` | string | ✅ | — | `MiniMax-M3`, `MiniMax-M2.7`, etc. |
| `max_tokens` | int | ✅ | — | Máximo de tokens a gerar |
| `messages` | array | ✅ | — | Lista de mensagens (role: user/assistant) |
| `system` | string | ❌ | — | Instrução do sistema |
| `thinking` | object | ❌ | off (M3) | `{"type": "adaptive"}` ou `{"type": "disabled"}` |
| `stream` | bool | ❌ | false | Streaming ativado |
| `temperature` | float | ❌ | 1.0 | Range [0, 2] |
| `top_p` | float | ❌ | 0.95 (M3) | Nucleus sampling |
| `tools` | array | ❌ | — | Definições de ferramentas |
| `tool_choice` | object | ❌ | — | Estratégia de seleção de tool |
| `service_tier` | string | ❌ | standard | `standard` ou `priority` (1.5× preço) |

### 3.5 Tabela de Parâmetros — OpenAI

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `model` | string | ✅ | — | `MiniMax-M3`, `MiniMax-M2.7`, etc. |
| `max_tokens` | int | ❌ | — | Limite de geração |
| `messages` | array | ✅ | — | Lista de mensagens |
| `temperature` | float | ❌ | 1.0 | Range [0, 2] |
| `top_p` | float | ❌ | 0.95 (M3) | Nucleus sampling |
| `tools` | array | ❌ | — | Funções (formato OpenAI) |
| `extra_body.reasoning_split` | bool | ❌ | false | Thinking em `reasoning_details` |
| `extra_body.thinking` | object | ❌ | on (M3) | `{"type": "adaptive"}` ou `{"type": "disabled"}` |
| `stream` | bool | ❌ | false | Streaming |
| `service_tier` | string | ❌ | standard | `standard` ou `priority` (1.5×) |

### 3.6 Resposta — Anthropic

```json
{
  "id": "msg_01...",
  "model": "MiniMax-M3",
  "content": [
    {"type": "thinking", "thinking": "...", "signature": "..."},
    {"type": "text", "text": "Resposta..."}
  ],
  "usage": {
    "input_tokens": 15,
    "output_tokens": 42,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  },
  "stop_reason": "end_turn"
}
```

### 3.7 Resposta — OpenAI (com `reasoning_split=True`)

```json
{
  "id": "chatcmpl-...",
  "choices": [{
    "message": {
      "content": "Resposta final...",
      "reasoning_details": [{"text": "Raciocínio..."}],
      "tool_calls": null
    }
  }],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 50,
    "total_tokens": 70
  }
}
```

---

## 4. Exemplos de Código

> Todos os exemplos abaixo foram **testados contra a API real da MiniMax**.

### 4.1 Anthropic — Mensagem Básica

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="https://api.minimax.io/anthropic",
    api_key="<MINIMAX_API_KEY>",
)

message = client.messages.create(
    model="MiniMax-M3",
    max_tokens=1000,
    system="You are a helpful assistant.",
    messages=[{"role": "user", "content": "Hi, how are you?"}],
)

for block in message.content:
    if block.type == "text":
        print(block.text)
```

**✅ Testado:** `test_send_basic_message` — `input_tokens` e `output_tokens` > 0.

### 4.2 Anthropic — Thinking Blocks

```python
message = client.messages.create(
    model="MiniMax-M3",
    max_tokens=2000,
    system="You are a helpful assistant.",
    thinking={"type": "adaptive"},
    messages=[{"role": "user", "content": "What is 2+2? Explain step by step."}],
)

for block in message.content:
    if block.type == "thinking":
        print(f"💭 {block.thinking}")
    elif block.type == "text":
        print(f"💬 {block.text}")
```

**✅ Testado:** `test_thinking_block` — Ambos `thinking` e `text` retornados.

### 4.3 Anthropic — Token Counting

```python
response = client.messages.count_tokens(
    model="MiniMax-M3",
    messages=[{"role": "user", "content": "Hello, how are you today?"}],
)
print(f"Input tokens: {response.input_tokens}")
```

**✅ Testado:** `test_count_tokens` — `input_tokens > 0`.

### 4.4 OpenAI — Chat Completion

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.minimax.io/v1",
    api_key="<MINIMAX_API_KEY>",
)

response = client.chat.completions.create(
    model="MiniMax-M3",
    max_tokens=1000,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Say 'hello' in French."},
    ],
    extra_body={"reasoning_split": True},
)

print(response.choices[0].message.content)
```

**✅ Testado:** `test_send_with_custom_prompt` — Retorna "bonjour".

### 4.5 OpenAI — Reasoning Split vs `<think>` Tag

**Com `reasoning_split=True`** (recomendado): thinking separado em `reasoning_details`.

**Sem `reasoning_split`** (padrão `False`): thinking embutido em tags `<think>`:

```python
response = client.chat.completions.create(
    model="MiniMax-M3",
    max_tokens=2000,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is 2+2? Explain step by step."},
    ],
    extra_body={"reasoning_split": False},
)

content = response.choices[0].message.content
print(content)
# <think>Let me calculate...
# </think>
# The answer is 4.
```

**✅ Testados:**
- `test_reasoning_split_enabled` — `reasoning_details` presente
- `test_native_format_contains_think_tag` — Tags `<think>` no content
- `test_parse_think_tags_with_real_response` — Parse funciona na API real

### 4.6 Parseando `<think>` com Python

```python
def parse_think_tags(content: str) -> dict:
    thinking = ""
    text = content
    start_tag = "<think>"
    end_tag = "</think>"
    start = content.find(start_tag)
    end = content.find(end_tag)
    if start != -1 and end != -1:
        thinking = content[start + len(start_tag):end]
        text = content[:start] + content[end + len(end_tag):]
    return {"thinking": thinking.strip(), "text": text.strip()}

parsed = parse_think_tags(content)
print(f"Thinking: {parsed['thinking']}")
print(f"Text: {parsed['text']}")
```

**✅ Testado:** `test_parse_think_tags_extracts_thinking_and_text`

### 4.7 Streaming

**Anthropic:**

```python
client = Anthropic(
    base_url="https://api.minimax.io/anthropic",
    api_key="<MINIMAX_API_KEY>",
)

stream = client.messages.create(
    model="MiniMax-M3",
    max_tokens=1000,
    system="You are a helpful assistant.",
    messages=[{"role": "user", "content": "Count from 1 to 3."}],
    stream=True,
)

for chunk in stream:
    if chunk.type == "content_block_delta":
        if chunk.delta.type == "thinking_delta":
            print(f"💭 {chunk.delta.thinking}", end="", flush=True)
        elif chunk.delta.type == "text_delta":
            print(f"💬 {chunk.delta.text}", end="", flush=True)
```

**✅ Testado:** `test_anthropic_stream_collects_content`

**OpenAI:**

```python
client = OpenAI(
    base_url="https://api.minimax.io/v1",
    api_key="<MINIMAX_API_KEY>",
)

stream = client.chat.completions.create(
    model="MiniMax-M3",
    max_tokens=1000,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Count from 1 to 5."},
    ],
    extra_body={"reasoning_split": True},
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta if chunk.choices else None
    if delta:
        if hasattr(delta, "reasoning_details") and delta.reasoning_details:
            for detail in delta.reasoning_details:
                if "text" in detail:
                    print(detail["text"], end="", flush=True)
        if delta.content:
            print(delta.content, end="", flush=True)
```

**✅ Testado:** `test_openai_stream_collects_content` — Números 1 a 5.

### 4.8 Tool Use — Anthropic

```python
import anthropic, json

client = anthropic.Anthropic(
    base_url="https://api.minimax.io/anthropic",
    api_key="<MINIMAX_API_KEY>",
)

tools = [{
    "name": "get_weather",
    "description": "Get weather of a location",
    "input_schema": {
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "City and state"}
        },
        "required": ["location"],
    },
}]

messages = [{"role": "user", "content": "How's the weather in San Francisco?"}]

response = client.messages.create(
    model="MiniMax-M3",
    max_tokens=4096,
    messages=messages,
    tools=tools,
)

tool_blocks = [b for b in response.content if b.type == "tool_use"]
tool_block = tool_blocks[0]
print(f"🔧 {tool_block.name}({tool_block.input})")

# ⚠️ Preserve response.content COMPLETO no histórico
messages.append({"role": "assistant", "content": response.content})
messages.append({
    "role": "user",
    "content": [{
        "type": "tool_result",
        "tool_use_id": tool_block.id,
        "content": "24℃, sunny",
    }],
})

final = client.messages.create(
    model="MiniMax-M3",
    max_tokens=4096,
    messages=messages,
    tools=tools,
)
```

**✅ Testados:**
- `test_tool_call_response` — `tool_use` blocks retornados
- `test_tool_call_with_tool_result` — Modelo incorpora resultado da ferramenta

### 4.9 Tool Use — OpenAI

```python
from openai import OpenAI
import json

client = OpenAI(
    base_url="https://api.minimax.io/v1",
    api_key="<MINIMAX_API_KEY>",
)

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get weather of a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City and state"}
            },
            "required": ["location"],
        },
    },
}]

messages = [{"role": "user", "content": "How's the weather in San Francisco?"}]

response = client.chat.completions.create(
    model="MiniMax-M3",
    max_tokens=4096,
    messages=messages,
    tools=tools,
    extra_body={"reasoning_split": True},
)

tool_call = response.choices[0].message.tool_calls[0]
print(f"🔧 {tool_call.function.name}({tool_call.function.arguments})")

messages.append(response.choices[0].message)
messages.append({
    "role": "tool",
    "tool_call_id": tool_call.id,
    "content": "24℃, sunny",
})

final = client.chat.completions.create(
    model="MiniMax-M3",
    max_tokens=4096,
    messages=messages,
    tools=tools,
    extra_body={"reasoning_split": True},
)
```

**✅ Testados:** Ambos testes OpenAI tool use passaram.

### 4.10 Prompt Caching

**Passive (automático):**

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="https://api.minimax.io/anthropic",
    api_key="<MINIMAX_API_KEY>",
)

system = "You are an AI assistant tasked with analyzing literary works."
large_text = "The quick brown fox " * 200

# Primeira chamada — cria cache
r1 = client.messages.create(
    model="MiniMax-M3", max_tokens=10240,
    system=system,
    messages=[{"role": "user", "content": large_text[:1000] + "\nSummarize."}],
)
print(f"Cache 1ª chamada: {r1.usage.cache_read_input_tokens}")

# Segunda chamada — reusa cache
r2 = client.messages.create(
    model="MiniMax-M3", max_tokens=10240,
    system=system,
    messages=[{"role": "user", "content": large_text[:1000] + "\nSummarize differently."}],
)
print(f"Cache 2ª chamada: {r2.usage.cache_read_input_tokens}")
```

**Explicit (cache_control) — Anthropic API:**

```python
response = client.messages.create(
    model="MiniMax-M2.7",
    max_tokens=1024,
    system=[
        {"type": "text", "text": "You are an AI assistant..."},
        {"type": "text", "text": large_text, "cache_control": {"type": "ephemeral"}},
    ],
    messages=[{"role": "user", "content": "What are the major themes?"}],
)

print(f"Cache creation: {response.usage.cache_creation_input_tokens}")
print(f"Cache read: {response.usage.cache_read_input_tokens}")
```

**✅ Testados:** `test_passive_caching_returns_usage`, `test_explicit_caching_anthropic`

### 4.11 Multimodal (Imagem)

> Apenas **MiniMax-M3** suporta entrada multimodal.

```python
from openai import OpenAI
import base64

client = OpenAI(
    base_url="https://api.minimax.io/v1",
    api_key="<MINIMAX_API_KEY>",
)

with open("imagem.png", "rb") as f:
    image_data = base64.b64encode(f.read()).decode("utf-8")

response = client.chat.completions.create(
    model="MiniMax-M3",
    max_tokens=1000,
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe what you see."},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{image_data}",
                    "detail": "low",
                },
            },
        ],
    }],
)

print(response.choices[0].message.content)
```

**✅ Testado:** `test_image_url_analysis` — Imagem analisada com sucesso.

---

## 5. Tratamento de Erros

### 5.1 Estrutura do erro (Anthropic)

```json
{
  "error": {
    "type": "bad_request_error",
    "message": "invalid param: ..."
  }
}
```

### 5.2 Estrutura do erro (OpenAI)

```json
{
  "error": {
    "code": 2013,
    "message": "invalid param: ...",
    "type": "bad_request_error"
  }
}
```

### 5.3 Matriz de decisão

| Código | Significado | Ação |
|---|---|---|
| `0` | Sucesso | ✅ Processar resposta |
| `400` | Bad request | Verificar parâmetros |
| `401` | Não autorizado | 🛑 Verificar API Key |
| `2013` | Parâmetro inválido | Verificar documentação |
| `1002` | Rate limit | ⏳ Aguardar e retentar |
| `1004` | Autenticação falhou | 🛑 Verificar API Key |
| `1008` | Saldo insuficiente | 🛑 Recarregar |
| `1026` | Prompt sensível | 🛑 Alterar prompt |
| `2049` | API Key inválida | 🛑 Verificar |

---

## 6. Rate Limits

| Modelo | Limite | Observação |
|---|---|---|
| MiniMax-M3 | Consultar documentação | — |
| Demais modelos | Consultar documentação | — |

> Consulte [documentação oficial de rate limits](https://platform.minimax.io/docs/guides/rate-limits) para valores atualizados.

---

## 7. Performance — Teste de Tokens por Segundo (TPS)

Testamos os modelos **MiniMax-M2.7** e **MiniMax-M2.7-highspeed** com 5 execuções cada, ordem randomizada, usando tokens reais da API (`usage.output_tokens`).

### 7.1 Resultados

| Modelo | TPS medio | Output tokens medio | Tempo medio |
|---|---|---|---|
| MiniMax-M2.7 | **65.0** | 1,836 | 36.02s |
| MiniMax-M2.7-highspeed | **39.2** | 1,807 | 46.08s |

**Razao: highspeed / normal = 0.60x**

### 7.2 Observacao importante

O M2.7 normal apresentou **alta variancia** (30-99 TPS entre execucoes), enquanto o highspeed foi **consistente** (36-41 TPS). A suspeita e que o M2.7 normal se beneficia de **cache passivo** aquecido por execucoes anteriores, enquanto o highspeed tem cache separado (modelo diferente). O TPS real de geracao de cada modelo pode ser diferente do medido devido a:

- Efeitos de cache (passive caching com prefix matching)
- Latencia de rede variavel (medicao end-to-end)
- Carga do servidor no momento do teste

> Consulte a documentacao oficial da MiniMax para valores de TPS no servidor.

**✅ Testados:** `test_model_responds` (2 modelos) + `test_tps_comparison` (5 runs cada, ordem randomizada).

---

## 8. Otimização de Custo

### 8.1 Preços

| Modelo | Input (≤512k) | Output |
|---|---|---|
| **MiniMax-M3** | $0.60 / 1M tokens | $2.40 / 1M tokens |
| M2.7 / M2.5 / M2.1 / M2 | $0.30 / 1M tokens | $1.20 / 1M tokens |
| Highspeed variants | $0.30 / 1M tokens | $2.40 / 1M tokens |

**Priority tier:** 1.5× o preço standard — processamento prioritário.

### 8.2 Cache Pricing

| Modelo | Cache Read | Cache Write |
|---|---|---|
| MiniMax-M3 | $0.12/M | Grátis (passive) |
| M2.7 | $0.06/M | $0.375/M |
| M2.5 | $0.03/M | $0.375/M |

### 8.3 Estratégias

- Use **caching** para system prompts e contextos grandes
- Prefira **Anthropic SDK** para recursos avançados (thinking, interleaved thinking)
- Use `reasoning_split=True` no OpenAI SDK para debugging mais fácil
- Para tool use, **sempre preserve** thinking blocks no histórico

---

## 9. Referência Rápida

### 9.1 Comandos

```bash
# Ativar ambiente virtual (Windows)
.venv\Scripts\Activate.ps1

# Instalar dependências
pip install -r requirements.txt

# Executar todos os testes
pytest tests/ -v

# Executar testes de texto
pytest tests/test_anthropic.py tests/test_openai.py tests/test_streaming.py tests/test_tool_use.py tests/test_caching.py tests/test_multimodal.py tests/test_performance.py -v
```

### 9.2 Checklist de boas práticas

- [ ] API Key em `.env`, nunca no código
- [ ] Tool use: preservar `response.content` completo no histórico
- [ ] Tool use: não modificar tags `<think>` entre chamadas
- [ ] Usar `reasoning_split=True` no OpenAI para debugging
- [ ] Colocar conteúdo estático (system prompt, tools) no início para caching
- [ ] Tratar erros 1002 (rate limit) com retry + backoff
- [ ] Usar base64 para imagens (URL pode falhar se servidor remoto bloquear)

### 9.3 `requirements.txt`

```
anthropic>=0.70.0
openai>=1.70.0
python-dotenv>=1.1.0
pytest>=8.0.0
```

---

## 10. Erros Comuns

| Problema | Causa | Solução |
|---|---|---|
| `401 Unauthorized` | API Key inválida | Verificar `.env` |
| Erro `2013` | Parâmetro inválido | Verificar documentação |
| Tool use quebra | Thinking não preservado | Manter `response.content` intacto |
| `<think>` sumiu | `reasoning_split=True` sem preservar | Manter `reasoning_details` no histórico |
| Imagem URL falha | Servidor remoto bloqueia | Usar base64 |
| Resposta truncada | `max_tokens` muito baixo | Aumentar `max_tokens` |

---

# Parte II: Imagem (`image-01`)

**Versão:** 1.0 | **Data:** 2026-06-07
**Endpoint:** `POST https://api.minimax.io/v1/image_generation`
**Modelo:** `image-01`

---

## 1. Visão Geral

A API `image-01` da MiniMax gera imagens a partir de descrições textuais (Text-to-Image) ou de imagens de referência (Image-to-Image).

### Destaques

- Geração de 1 a 9 imagens por chamada
- 8 aspect ratios suportados
- Resoluções customizáveis (512–2048px)
- Seed para imagens reproduzíveis
- Otimizador automático de prompt
- Custo: **$0.0035 por imagem**

---

## 2. Setup Rápido

### 2.1 Dependências

```bash
pip install requests python-dotenv
```

### 2.2 Arquivo `.env`

```env
MINIMAX_API_KEY=seu_token_aqui
```

### 2.3 Estrutura de diretórios sugerida

```
projeto/
├── .env
├── .gitignore
├── generate.py
├── requirements.txt
└── img/
```

### 2.4 `.gitignore`

```
.env
.venv/
img/
test_output/
__pycache__/
```

---

## 3. Parâmetros da API

### 3.1 Corpo da requisição (JSON)

```json
{
  "model": "image-01",
  "prompt": "descrição da imagem, máximo 1500 caracteres",
  "aspect_ratio": "16:9",
  "response_format": "base64",
  "n": 1,
  "seed": 42,
  "prompt_optimizer": false
}
```

### 3.2 Tabela completa de parâmetros

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `model` | string | ✅ | — | `"image-01"` |
| `prompt` | string | ✅ | — | Máximo **1500 caracteres** |
| `aspect_ratio` | string | ❌ | `"1:1"` | Ver tabela abaixo |
| `width` | int | ❌ | — | 512–2048, divisível por 8 |
| `height` | int | ❌ | — | 512–2048, divisível por 8 |
| `response_format` | string | ❌ | `"url"` | `"url"` (expira 24h) ou `"base64"` |
| `n` | int | ❌ | `1` | 1 a 9 imagens |
| `seed` | int | ❌ | — | Seed para reproducibilidade |
| `prompt_optimizer` | bool | ❌ | false | Otimização automática |
| `subject_reference` | object[] | ❌ | — | Imagem de referência (I2I) |

### 3.3 Aspect Ratios e resoluções

| Ratio | Resolução (px) | Uso típico |
|---|---|---|
| `1:1` | 1024 × 1024 | Redes sociais, avatar |
| `16:9` | 1280 × 720 | Vídeos, apresentações |
| `4:3` | 1152 × 864 | Fotografia clássica |
| `3:2` | 1248 × 832 | Fotografia analógica |
| `2:3` | 832 × 1248 | Retrato vertical |
| `3:4` | 864 × 1152 | Retrato |
| `9:16` | 720 × 1280 | Stories, TikTok |
| `21:9` | 1344 × 576 | Ultra-wide, cinema |

### 3.4 Cabeçalhos HTTP

```
Authorization: Bearer MINIMAX_API_KEY
Content-Type: application/json
```

### 3.5 Resposta

```json
{
  "id": "03ff3cd0820949eb8a410056b5f21d38",
  "data": {
    "image_urls": ["url1", "url2"],
    "image_base64": ["base64...", "base64..."]
  },
  "metadata": {
    "failed_count": "0",
    "success_count": "2"
  },
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

> ⚠️ URLs expiram em **24 horas**. Prefira `base64` para armazenamento permanente.

---

## 4. Exemplos de Código

> Todos os exemplos abaixo foram **testados contra a API real da MiniMax**.

### 4.1 Básico — Texto para Imagem

```python
import base64
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = "https://api.minimax.io/v1/image_generation"
OUTPUT_DIR = Path("img")
OUTPUT_DIR.mkdir(exist_ok=True)

api_key = os.getenv("MINIMAX_API_KEY")
if not api_key:
    raise SystemExit("MINIMAX_API_KEY não encontrada")

response = requests.post(
    API_URL,
    headers={"Authorization": f"Bearer {api_key}"},
    json={
        "model": "image-01",
        "prompt": "Pôr do sol na praia, cores vibrantes, estilo cinematográfico",
        "aspect_ratio": "16:9",
        "response_format": "base64",
    },
    timeout=30,
)
response.raise_for_status()
data = response.json()

images = data["data"].get("image_base64", [])
if not images:
    print(f"Falha: {data.get('base_resp', {}).get('status_msg', 'erro desconhecido')}")
else:
    for i, b64 in enumerate(images):
        path = OUTPUT_DIR / f"imagem-{i+1:02d}.jpeg"
        path.write_bytes(base64.b64decode(b64))
        print(f"Salvo: {path}")
```

**✅ Testado:** `test_basic_text_to_image` — 1 imagem gerada com sucesso.

### 4.2 Com `n=9`

```python
payload = {
    "model": "image-01",
    "prompt": "Montanha nevada ao amanhecer, foto profissional",
    "aspect_ratio": "16:9",
    "response_format": "base64",
    "n": 9,
}

resp = requests.post(API_URL, headers=headers, json=payload, timeout=60)
data = resp.json()

for i, b64 in enumerate(data["data"]["image_base64"]):
    path = OUTPUT_DIR / f"img-{i+1:02d}.jpeg"
    path.write_bytes(base64.b64decode(b64))

print(f"Geradas {len(data['data']['image_base64'])} imagens em 1 requisição")
```

**✅ Testado:** `test_multiple_images_n9` — 9 imagens em ~18s (vs ~144s fazendo 9 chamadas).

### 4.3 Com `seed`

```python
payload = {
    "model": "image-01",
    "prompt": "Gato laranja dormindo no sofá",
    "aspect_ratio": "16:9",
    "response_format": "base64",
    "seed": 12345,
}
```

**✅ Testado:** `test_with_seed` — Seed aceito, imagem gerada.

### 4.4 Com `prompt_optimizer`

```python
payload = {
    "model": "image-01",
    "prompt": "Robô vintage de lata, oficina antiga",
    "aspect_ratio": "16:9",
    "response_format": "base64",
    "prompt_optimizer": True,
}
```

**✅ Testado:** `test_with_prompt_optimizer` — Imagem gerada com optimizer ativo.

### 4.5 Diferentes Aspect Ratios

```python
for ratio in ["1:1", "16:9", "4:3"]:
    data = generate_images(prompt=TEST_PROMPT, aspect_ratio=ratio, n=1)
    assert data["base_resp"]["status_code"] == 0
```

**✅ Testado:** `test_different_aspect_ratios` — Todos os ratios funcionam.

### 4.6 Classe reutilizável

```python
import base64, os, time
from pathlib import Path
import requests
from dotenv import load_dotenv

load_dotenv()


class MiniMaxImage:
    def __init__(self, output_dir: str = "img"):
        self.api_key = os.getenv("MINIMAX_API_KEY")
        self.api_url = "https://api.minimax.io/v1/image_generation"
        self.headers = {"Authorization": f"Bearer {self.api_key}"}
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def generate(self, prompt, aspect_ratio="16:9", n=9, seed=None,
                 prompt_optimizer=False, timeout=60):
        payload = {
            "model": "image-01",
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "response_format": "base64",
            "n": n,
            "prompt_optimizer": prompt_optimizer,
        }
        if seed is not None:
            payload["seed"] = seed

        resp = requests.post(
            self.api_url, headers=self.headers,
            json=payload, timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        base_resp = data.get("base_resp", {})

        if base_resp.get("status_code") != 0:
            raise RuntimeError(
                f"API error {base_resp['status_code']}: {base_resp.get('status_msg', '?')}"
            )

        arquivos = []
        for i, b64 in enumerate(data["data"].get("image_base64", [])):
            path = self.output_dir / f"img-{i+1:02d}.jpeg"
            path.write_bytes(base64.b64decode(b64))
            arquivos.append(path)
        return arquivos


# Uso:
if __name__ == "__main__":
    api = MiniMaxImage()
    arquivos = api.generate("Cachorro golden retriever em campo de flores", n=4)
    for f in arquivos:
        print(f"Salvo: {f}")
```

---

## 5. Tratamento de Erros

### 5.1 Matriz de decisão

| Código | Significado | Ação |
|---|---|---|
| `0` | Sucesso | ✅ Processar imagem |
| `1002` | Rate limit (RPM) | ⏳ Esperar 60s e retentar |
| `1004` | Não autorizado | 🛑 Verificar API Key |
| `1008` | Saldo insuficiente | 🛑 Recarregar conta |
| `1026` | Prompt sensível | 🛑 Alterar prompt |
| `1027` | Output sensível | 🛑 Alterar prompt |
| `2045` | Growth limit (pico) | ⏳ Esperar 30s e retentar |
| `2049` | API Key inválida | 🛑 Verificar API Key |
| `2056` | Cota janela 5h | 🛑 Aguardar 5h |

### 5.2 Exemplo com retry

```python
def generate_with_retry(prompt, max_retry=3):
    for tentativa in range(1, max_retry + 1):
        try:
            resp = requests.post(
                "https://api.minimax.io/v1/image_generation",
                headers=headers, json=payload, timeout=30,
            )
            data = resp.json()
            code = data.get("base_resp", {}).get("status_code")

            if code == 0:
                return data
            if code == 1002:
                time.sleep(60)
                continue
            if code == 2045:
                time.sleep(30)
                continue
            if code in (1004, 2049):
                raise SystemExit(f"Erro autenticação: {code}")

        except requests.exceptions.Timeout:
            if tentativa < max_retry:
                time.sleep(10)
            else:
                raise

    raise RuntimeError(f"Falha após {max_retry} tentativas")
```

**✅ Testado:** `test_generate_with_retry_success` — Retry funciona.

---

## 6. Rate Limits — O Que Aprendemos

### 6.1 Limite oficial

Documentação oficial: **10 RPM** para `image-01`.

### 6.2 Descoberta dos testes

O gargalo real é a **latência**, não o rate limit. Cada requisição leva **14–24 segundos** (média ~16s). Sequencialmente, o máximo é ~3.7 req/min:

```
60s / 16s por req ≈ 3,75 requisições por minuto
```

**Resultado:** Em **121 requisições de teste**, zero erros `1002`, `2056` ou `2045`.

### 6.3 Estratégias

| Cenário | RPM possível | Estratégia |
|---|---|---|
| 1 usuário, uso esporádico | ~3.7 RPM | `n=9`, sem pausas |
| Muitas imagens sob demanda | Até 30 img/min | `n=9` + paralelismo (2-3 workers) |
| Testar limite de 10 RPM | Só com paralelismo | ThreadPoolExecutor 3-4 workers |

---

## 7. Otimização de Custo

### 7.1 Cálculo

```
Custo por imagem: $0.0035
Imagens por $1:   ~285
```

### 7.2 Estratégias

| Estratégia | Chamadas | Imagens | Tempo | Custo | RPM |
|---|---|---|---|---|---|
| `n=1` sequencial | 9 | 9 | ~144s | $0.0315 | 9 |
| `n=9` | **1** | **9** | **~18s** | $0.0315 | **1** |
| `n=9` + 2 workers | 2 | 18 | ~18s | $0.063 | 2 |
| `n=9` + 3 workers | 3 | 27 | ~18s | $0.0945 | 3 |

**`n=9` é a otimização mais importante:** mesmo custo, 8× mais rápido, 9× menos RPM.

---

## 8. Referência Rápida

### 8.1 Comandos

```bash
# Ativar ambiente virtual (Windows)
.venv\Scripts\Activate.ps1

# Instalar dependências
pip install -r requirements.txt

# Gerar imagem
python generate.py --prompt "sua descrição"

# Com aspect ratio
python generate.py --prompt "..." --aspect-ratio "16:9"

# Executar testes de imagem
pytest tests/test_image.py -v
```

### 8.2 Checklist de boas práticas

- [ ] Usar `n=9` (9 imagens em 1 chamada vs 9 chamadas)
- [ ] `response_format: "base64"` em vez de `"url"`
- [ ] Timeout ≥ 60s quando usar `n=9`
- [ ] Sem pausas artificiais entre chamadas
- [ ] Tratar erro `1002` com retry + backoff
- [ ] Tratar erro `2056` como fatal (quota 5h)
- [ ] Usar `seed` para reprodutibilidade
- [ ] Prompt ≤ 1500 caracteres
- [ ] API Key em `.env`, nunca no código

### 8.3 `requirements.txt`

```
requests>=2.31.0
python-dotenv>=1.0.0
```

---

## 9. Erros Comuns

| Problema | Causa | Solução |
|---|---|---|
| `401 Unauthorized` | API Key inválida | Verificar `.env` e console MiniMax |
| Timeout com `n=9` | Timeout < 30s | Aumentar para 60s |
| Erro `1026` | Prompt sensível | Reformular prompt |
| Erro `2056` | Cota 5h esgotada | Aguardar ou verificar plano |
| Erro `1002` | Muitas reqs paralelas | Reduzir workers ou usar `n=9` |
| Imagem preta/branca | Prompt bloqueado safety | Verificar `status_code` = 1026 |
| `response_format: "url"` expirou | 24h se passaram | Usar `base64` |

---

# Parte III: Áudio *(em breve)*

Esta seção será preenchida com a API de **Texto-para-Fala (TTS)** e **Reconhecimento de Fala (ASR)** da MiniMax.

**Tópicos planeados:**
- Síntese de fala (TTS) — síncrona e assíncrona
- Clonagem de voz
- WebSocket para TTS em tempo real
- Lista de vozes disponíveis

---

## Apêndice: Resumo de Todos os Testes

```
======================== 34 passed ========================

PARTE I — TEXTO (27 testes)
  test_anthropic.py       ✅ 5/5
  test_openai.py          ✅ 8/8  (básico + think tag)
  test_streaming.py       ✅ 3/3
  test_tool_use.py        ✅ 4/4
  test_caching.py         ✅ 2/2
  test_multimodal.py      ✅ 1/1
  test_performance.py     ✅ 4/4  (responder + TPS comparação)

PARTE II — IMAGEM (7 testes)
  test_image.py           ✅ 7/7

TOTAL: 34/34 testes passando ✅
```
