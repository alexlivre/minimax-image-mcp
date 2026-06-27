# Guia Completo — API de Geração de Imagens MiniMax (`image-01`)

**Versão:** 1.0 | **Data:** 2026-06-07
**Endpoint:** `POST https://api.minimax.io/v1/image_generation`
**Modelo:** `image-01`

---

## Índice

- [1. Visão Geral](#1-visão-geral)
- [2. Setup Rápido](#2-setup-rápido)
- [3. Parâmetros da API](#3-parâmetros-da-api)
- [4. Exemplos de Código](#4-exemplos-de-código)
  - [4.1 Básico — Texto para Imagem](#41-básico--texto-para-imagem)
  - [4.2 Com `n=9` (mais eficiente)](#42-com-n9-mais-eficiente)
  - [4.3 Com `seed` para reproduzir imagens](#43-com-seed-para-reproduzir-imagens)
  - [4.4 Com `prompt_optimizer`](#44-com-prompt_optimizer)
  - [4.5 Image-to-Image (I2I) com `subject_reference`](#45-image-to-image-i2i-com-subject_reference)
  - [4.6 Classe reutilizável](#46-classe-reutilizável)
  - [4.7 Geração assíncrona com paralelismo](#47-geração-assíncrona-com-paralelismo)
  - [4.8 Teste de rate limit](#48-teste-de-rate-limit)
- [5. Tratamento de Erros](#5-tratamento-de-erros)
- [6. Rate Limits — O Que Aprendemos](#6-rate-limits--o-que-aprendemos)
- [7. Otimização de Custo](#7-otimização-de-custo)
- [8. Referência Rápida](#8-referência-rápida)
- [9. Erros Comuns](#9-erros-comuns)

---

## 1. Visão Geral

A API `image-01` da MiniMax gera imagens a partir de descrições textuais (Text-to-Image) ou de imagens de referência (Image-to-Image).

**Destaques:**
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
├── .env              # MINIMAX_API_KEY (NÃO versionar!)
├── .gitignore
├── generate.py       # Script principal
├── requirements.txt  # requests, python-dotenv
└── img/              # Imagens geradas (opcional: gitignore)
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
|-----------|------|:-----------:|:------:|-----------|
| `model` | `string` | ✅ | — | `"image-01"` |
| `prompt` | `string` | ✅ | — | Máximo **1500 caracteres** |
| `aspect_ratio` | `string` | ❌ | `"1:1"` | Ver tabela abaixo |
| `width` | `int` | ❌ | — | 512–2048, divisível por 8. `aspect_ratio` tem prioridade |
| `height` | `int` | ❌ | — | 512–2048, divisível por 8. `aspect_ratio` tem prioridade |
| `response_format` | `string` | ❌ | `"url"` | `"url"` (expira em 24h) ou `"base64"` |
| `n` | `int` | ❌ | `1` | 1 a 9 imagens por chamada |
| `seed` | `int` | ❌ | — | Seed para reproducibilidade |
| `prompt_optimizer` | `bool` | ❌ | `false` | Otimização automática do prompt |
| `subject_reference` | `object[]` | ❌ | — | Imagem de referência para I2I |

### 3.3 Aspect Ratios e resoluções

| Ratio | Resolução (px) | Uso típico |
|:-----:|:--------------:|:-----------|
| `1:1` | 1024 × 1024 | Redes sociais, avatar |
| `16:9` | 1280 × 720 | Vídeos, apresentações |
| `4:3` | 1152 × 864 | Fotografia clássica |
| `3:2` | 1248 × 832 | Fotografia analógica |
| `2:3` | 832 × 1248 | Retrato vertical |
| `3:4` | 864 × 1152 | Retrato |
| `9:16` | 720 × 1280 | Stories, TikTok, Reels |
| `21:9` | 1344 × 576 | Ultra-wide, cinema |

> **Dica:** Use `width` e `height` para resoluções customizadas. Ambos devem estar entre 512 e 2048, e ser divisíveis por 8. Se `aspect_ratio` também for fornecido, ele tem prioridade.

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

> **⚠️ Importante:** Se `response_format` for `"url"`, as URLs expiram em **24 horas**. Prefira `"base64"` para armazenamento permanente.

---

## 4. Exemplos de Código

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
    raise SystemExit("MINIMAX_API_KEY não encontrada no .env")

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

### 4.2 Com `n=9`

Nossos testes: `n=9` gerou 9 imagens em ~18s (1 chamada), enquanto 9 chamadas com `n=1` levariam ~144s. Ambas consomem 1 RPM e custam $0.0315 pelo mesmo total de imagens.

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
headers = {"Authorization": f"Bearer {api_key}"}

payload = {
    "model": "image-01",
    "prompt": "Montanha nevada ao amanhecer, foto profissional, alta resolução",
    "aspect_ratio": "16:9",
    "response_format": "base64",
    "n": 9,
}

resp = requests.post(API_URL, headers=headers, json=payload, timeout=60)
resp.raise_for_status()
data = resp.json()

images = data["data"].get("image_base64", [])
if not images:
    print(f"Falha: {data.get('base_resp', {}).get('status_msg', 'erro')}")
else:
    for i, b64 in enumerate(images):
        path = OUTPUT_DIR / f"img-{i+1:02d}.jpeg"
        path.write_bytes(base64.b64decode(b64))
        print(f"Salvo: {path}")

print(f"Geradas {len(images)} imagens em 1 requisição")
```

> **Performance:** 9 imagens em ~18s vs 144s fazendo 9 chamadas separadas (8× mais rápido).

### 4.3 Com `seed` para reproduzir imagens

Use o mesmo `seed` + mesmos parâmetros para obter exatamente a mesma imagem.

```python
import base64

import requests
from dotenv import load_dotenv
import os

load_dotenv()

payload = {
    "model": "image-01",
    "prompt": "Gato laranja dormindo no sofá",
    "aspect_ratio": "16:9",
    "response_format": "base64",
    "seed": 12345,  # mesmo seed = mesma imagem
    "n": 1,
}

resp = requests.post(
    "https://api.minimax.io/v1/image_generation",
    headers={"Authorization": f"Bearer {os.getenv('MINIMAX_API_KEY')}"},
    json=payload,
    timeout=30,
)

data = resp.json()
b64 = data["data"]["image_base64"][0]
Path("gato-reprodutivel.jpeg").write_bytes(base64.b64decode(b64))
```

> **Nota:** Se `seed` for omitido, cada uma das `n` imagens recebe um seed aleatório diferente.

### 4.4 Com `prompt_optimizer`

```python
import base64

import requests
from dotenv import load_dotenv
import os

load_dotenv()

payload = {
    "model": "image-01",
    "prompt": "Robô vintage de lata, oficina antiga",
    "aspect_ratio": "16:9",
    "response_format": "base64",
    "prompt_optimizer": True,  # ativa otimização automática
    "n": 1,
}

resp = requests.post(
    "https://api.minimax.io/v1/image_generation",
    headers={"Authorization": f"Bearer {os.getenv('MINIMAX_API_KEY')}"},
    json=payload,
    timeout=30,
)

data = resp.json()
b64 = data["data"]["image_base64"][0]
Path("img/rob-otimizado.jpeg").write_bytes(base64.b64decode(b64))
```

> **Observação:** O `prompt_optimizer` expande o prompt adicionando detalhes. Nossos testes mostraram imagens **5-11% maiores** em tamanho de arquivo quando ativado. Pode adicionar elementos que você não pediu explicitamente.

### 4.5 Image-to-Image (I2I) com `subject_reference`

Mantenha a identidade visual de um personagem em diferentes cenários:

```python
import base64
import requests
from dotenv import load_dotenv
import os

load_dotenv()

payload = {
    "model": "image-01",
    "prompt": "O personagem está em uma praia tropical, ilhas ao fundo",
    "aspect_ratio": "16:9",
    "response_format": "base64",
    "subject_reference": [
        {
            "type": "character",
            "image_file": "https://exemplo.com/imagem-personagem.jpg",
        }
    ],
    "n": 2,
}

resp = requests.post(
    "https://api.minimax.io/v1/image_generation",
    headers={"Authorization": f"Bearer {os.getenv('MINIMAX_API_KEY')}"},
    json=payload,
    timeout=30,
)

data = resp.json()
for i, b64 in enumerate(data["data"]["image_base64"]):
    Path(f"i2i-{i+1:02d}.jpeg").write_bytes(base64.b64decode(b64))
```

### 4.6 Classe reutilizável

Versão completa e robusta para usar como biblioteca:

```python
import base64
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()


class MiniMaxImage:
    def __init__(self, output_dir: str = "img"):
        self.api_key = os.getenv("MINIMAX_API_KEY")
        if not self.api_key:
            raise SystemExit("MINIMAX_API_KEY não encontrada")
        self.api_url = "https://api.minimax.io/v1/image_generation"
        self.headers = {"Authorization": f"Bearer {self.api_key}"}
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def _next_filename(self, prefix: str = "img"):
        existentes = [p for p in self.output_dir.iterdir() if p.suffix == ".jpeg"]
        numeros = [
            int(p.stem.split("-")[1])
            for p in existentes
            if p.stem.startswith(f"{prefix}-")
        ]
        return self.output_dir / f"{prefix}-{max(numeros, default=0) + 1:02d}.jpeg"

    def generate(
        self,
        prompt: str,
        aspect_ratio: str = "16:9",
        n: int = 9,
        seed: int | None = None,
        prompt_optimizer: bool = False,
        timeout: int = 60,
    ) -> list[Path]:
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
            self.api_url, headers=self.headers, json=payload, timeout=timeout
        )
        resp.raise_for_status()
        data = resp.json()
        base_resp = data.get("base_resp", {})

        if base_resp.get("status_code") != 0:
            raise RuntimeError(
                f"API error {base_resp['status_code']}: {base_resp.get('status_msg', '?')}"
            )

        imagens = data["data"].get("image_base64", [])
        if not imagens:
            raise RuntimeError("API retornou sucesso mas sem imagens")

        arquivos = []
        for b64 in imagens:
            path = self._next_filename()
            path.write_bytes(base64.b64decode(b64))
            arquivos.append(path)

        return arquivos


# Uso:
if __name__ == "__main__":
    api = MiniMaxImage()
    arquivos = api.generate(
        prompt="Cachorro golden retriever correndo em campo de flores",
        n=4,
        seed=777,
    )
    for f in arquivos:
        print(f"Salvo: {f}")
```

### 4.7 Geração assíncrona com paralelismo

Para gerar muitas imagens rapidamente, combinando `n=9` com múltiplas threads:

```python
import base64
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = "https://api.minimax.io/v1/image_generation"
HEADERS = {"Authorization": f"Bearer {os.getenv('MINIMAX_API_KEY')}"}
OUTPUT_DIR = Path("img")
OUTPUT_DIR.mkdir(exist_ok=True)

contador = 0


def gerar_lote(prompt, seed_base):
    global contador
    payload = {
        "model": "image-01",
        "prompt": prompt,
        "aspect_ratio": "16:9",
        "response_format": "base64",
        "n": 9,
        "seed": seed_base,
    }
    try:
        resp = requests.post(API_URL, headers=HEADERS, json=payload, timeout=60)
        data = resp.json()
        imagens = data["data"].get("image_base64", [])
        arquivos = []
        for b64 in imagens:
            contador += 1
            path = OUTPUT_DIR / f"lote-{contador:03d}.jpeg"
            path.write_bytes(base64.b64decode(b64))
            arquivos.append(path)
        return arquivos
    except Exception as e:
        return [f"Erro: {e}"]


# Gera 36 imagens em 4 chamadas paralelas (n=9 cada)
with ThreadPoolExecutor(max_workers=3) as executor:
    futures = [
        executor.submit(gerar_lote, "Paisagem futurista, cyberpunk, neon", i)
        for i in range(100, 104)
    ]
    for f in as_completed(futures):
        print(f"Lote concluído: {len(f.result())} imagens")
```

> **Aviso:** Mais de 2 workers concorrentes pode disparar erro `1002` (RPM). Nossos testes com 1 worker sequencial nunca atingiram o limite de 10 RPM.

### 4.8 Teste de rate limit

Script para validar o comportamento da API sob carga:

```python
import csv
import os
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = "https://api.minimax.io/v1/image_generation"
HEADERS = {"Authorization": f"Bearer {os.getenv('MINIMAX_API_KEY')}"}
CSV_PATH = Path("rate_test.csv")

with open(CSV_PATH, "w", newline="") as f:
    csv.writer(f).writerow([
        "req#", "status", "status_code", "http_status",
        "start", "duration_ms", "obs"
    ])

for i in range(1, 11):
    inicio = time.perf_counter()
    ts = datetime.now().isoformat()
    try:
        resp = requests.post(
            API_URL,
            headers=HEADERS,
            json={
                "model": "image-01",
                "prompt": f"Test pattern {i}",
                "aspect_ratio": "16:9",
                "response_format": "base64",
            },
            timeout=30,
        )
        data = resp.json()
        code = data.get("base_resp", {}).get("status_code", "?")
        status = "ok" if code == 0 else "fail"
        obs = ""
    except Exception as e:
        code = "timeout"
        status = "fail"
        obs = str(e)

    ms = (time.perf_counter() - inicio) * 1000
    with open(CSV_PATH, "a", newline="") as f:
        csv.writer(f).writerow([i, status, code, resp.status_code if 'resp' in dir() else '-', ts, f"{ms:.0f}", obs])
    print(f"[{i}/10] {status} code={code} {ms:.0f}ms")
    time.sleep(1)

print(f"Relatório salvo em {CSV_PATH}")
```

---

## 5. Tratamento de Erros

### 5.1 Estrutura do erro

```python
import requests
from dotenv import load_dotenv
import os, time

load_dotenv()

def gerar_com_tratamento(prompt, max_retry=3):
    headers = {"Authorization": f"Bearer {os.getenv('MINIMAX_API_KEY')}"}
    payload = {
        "model": "image-01", "prompt": prompt,
        "aspect_ratio": "16:9", "response_format": "base64",
    }

    for tentativa in range(1, max_retry + 1):
        try:
            resp = requests.post(
                "https://api.minimax.io/v1/image_generation",
                headers=headers, json=payload, timeout=30,
            )
            data = resp.json()
            base = data.get("base_resp", {})
            code = base.get("status_code")

            if code == 0:
                return data

            # Erros recuperáveis
            if code == 1002:       # rate limit - esperar e tentar de novo
                print(f"Rate limit (1002), tentativa {tentativa}/{max_retry}, aguardando 60s")
                time.sleep(60)
                continue
            if code == 2045:       # growth limit - esperar e tentar de novo
                print(f"Growth limit (2045), tentativa {tentativa}/{max_retry}, aguardando 30s")
                time.sleep(30)
                continue
            if code == 2056:       # quota esgotada - não adianta retentar
                raise SystemExit("Cota da janela de 5h esgotada. Aguarde.")
            if code in (1004, 2049):  # erro de chave
                raise SystemExit(f"Erro de autenticação: {code}")
            if code in (1026, 1027):  # conteúdo sensível
                raise ValueError(f"Prompt bloqueado por safety: {base.get('status_msg')}")

            # Outros erros
            print(f"Erro API code {code}: {base.get('status_msg')}")
            return data

        except requests.exceptions.Timeout:
            if tentativa < max_retry:
                print(f"Timeout, tentativa {tentativa}/{max_retry}, aguardando 10s")
                time.sleep(10)
            else:
                raise

    raise RuntimeError(f"Falha após {max_retry} tentativas")
```

### 5.2 Matriz de decisão

| Código | Significado | Ação |
|:------:|:------------|:-----|
| `0` | Sucesso | ✅ Processar imagem |
| `1002` | Rate limit (RPM) | ⏳ Esperar 60s e retentar |
| `1004` | Não autorizado | 🛑 Verificar API Key |
| `1008` | Saldo insuficiente | 🛑 Recarregar conta |
| `1026` | Prompt sensível | 🛑 Alterar prompt |
| `1027` | Output sensível | 🛑 Alterar prompt |
| `2045` | Growth limit (pico) | ⏳ Esperar 30s e retentar |
| `2049` | API Key inválida | 🛑 Verificar API Key |
| `2056` | Cota da janela 5h | 🛑 Aguardar 5h |
| `timeout` | HTTP timeout (30s) | ⏳ Aumentar timeout ou retentar |

---

## 6. Rate Limits — O Que Aprendemos

### 6.1 Limite oficial

A documentação oficial da MiniMax define **10 RPM** para `image-01`.

### 6.2 Descoberta dos nossos testes

**O gargalo real é a latência, não o rate limit.**

Cada requisição leva **14–24 segundos** (média ~16s). Sequencialmente, o máximo que conseguimos foi ~3.7 req/min:

```
60s / 16s por req ≈ 3,75 requisições por minuto
```

**Resultado:** Em **121 requisições de teste**, zero erros `1002`, `2056` ou `2045`.

### 6.3 Implicações práticas

| Cenário | RPM possível | Estratégia |
|:--------|:------------:|:-----------|
| 1 usuário, uso esporádico | ~3.7 RPM | `n=9`, sem pausas |
| Muitas imagens sob demanda | Até 30 img/min | `n=9` + paralelismo (2-3 workers) |
| Testar limite real de 10 RPM | Só com paralelismo | ThreadPoolExecutor com 3-4 workers |

### 6.4 Melhores práticas

1. **Nunca espere entre requisições** — disparar em sequência é seguro
2. **Use `n=9`** — 9 imagens por requisição, mesmo custo de 1 RPM
3. **Máximo 3 workers paralelos** — acima disso pode disparar `1002`
4. **Evite picos abruptos** — crescendo gradualmente (2→4→6 reqs) evita `2045`

---

## 7. Otimização de Custo

### 7.1 Cálculo

```
Custo por imagem: $0.0035
Imagens por $1:   ~285
```

### 7.2 Estratégias

| Estratégia | Chamadas | Imagens | Tempo | Custo | RPM |
|:-----------|:--------:|:-------:|:-----:|:-----:|:---:|
| `n=1` sequencial | 9 | 9 | ~144s | $0.0315 | 9 |
| `n=9` | **1** | **9** | **~18s** | $0.0315 | **1** |
| `n=9` + 2 workers | 2 | 18 | ~18s | $0.063 | 2 |
| `n=9` + 3 workers | 3 | 27 | ~18s | $0.0945 | 3 |

**A `n=9` é de longe a otimização mais importante:** mesmo custo, 8× mais rápido, 9× menos consumo de rate limit.

---

## 8. Referência Rápida

### 8.1 Comandos

```bash
# Ativar ambiente virtual (Windows)
.venv\Scripts\Activate.ps1

# Instalar dependências
pip install -r requirements.txt

# Gerar imagem
python generate.py --prompt "sua descrição aqui"

# Com aspect ratio diferente
python generate.py --prompt "..." --aspect-ratio "16:9"

# Com otimizador de prompt
python generate.py --prompt "..." --prompt-optimizer
```

### 8.2 Checklist de boas práticas

- [ ] Usar `n=9` (nossos testes: 9 imagens em 1 chamada vs 9)
- [ ] `response_format: "base64"` em vez de `"url"`
- [ ] Timeout ≥ 60s quando usar `n=9`
- [ ] Sem pausas artificiais entre chamadas
- [ ] Tratar erro `1002` com retry + backoff
- [ ] Tratar erro `2056` como fatal (quota 5h)
- [ ] Usar `seed` para reprodutibilidade quando necessário
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
|:---------|:------|:--------|
| `401 Unauthorized` | API Key inválida ou expirada | Verificar `.env` e console MiniMax |
| `Timeout` com `n=9` | Timeout < 30s | Aumentar para 60s |
| Erro `1026` | Prompt com conteúdo sensível | Reformular o prompt |
| Erro `2056` | Cota da janela de 5h esgotada | Aguardar ou verificar plano |
| Erro `1002` | Muitas reqs em paralelo | Reduzir workers ou usar `n=9` |
| Imagem preta/branca | Prompt bloqueado pelo safety | Verificar se `status_code` é 1026 |
| Retorno vazio | API retornou `image_base64: null` | Geralmente conteúdo bloqueado |
| `response_format: "url"` expirou | Passaram 24h | Usar `base64` para persistência |

---

*Guia baseado em testes práticos com a API MiniMax `image-01` em 2026-06-07.*
*Documentação oficial em: https://platform.minimax.io/docs*
