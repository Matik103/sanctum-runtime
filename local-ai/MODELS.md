# Local AI models (Sanctum development)

This document describes the **local inference stack** used for Sanctum development: offline-capable agents, integration tests, and local risk scoring. Weights are **not** committed to git; this file explains what to install and how both runtimes share the same files.

---

## What is installed (reference setup)

| Ollama name | Base model | Quantization | Disk (approx.) | Role |
|-------------|------------|--------------|----------------|------|
| `qwen2.5-3b-instruct` | [Qwen2.5-3B-Instruct](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF) | **Q4_K_M** | ~2.0–2.1 GB | **Primary** — realistic local agent, structured prompts, production-like runs |
| `qwen2.5-0.5b-instruct` | [Qwen2.5-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF) | **Q4_K_M** | ~0.5 GB | **Fast** — plumbing, quick smoke tests |

**Runtimes**

| Tool | Install (macOS) | Version (reference) |
|------|-----------------|---------------------|
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | `brew install llama.cpp` | 9150+ |
| [Ollama](https://ollama.com) | https://ollama.com/download | 0.21+ |

**Important:** Sanctum’s trust layer (action verification, audit, policy) does **not** depend on which local model you use. Models simulate the **agent**; Sanctum gates **actions**.

---

## Hardware assumptions

Tuned for a **8 GB RAM** dev machine (Intel Mac, CPU inference):

- Use **3B** for credible agent behavior; close heavy browser tabs before runs.
- Use **0.5B** when speed matters.
- Keep context at **`num_ctx 2048`** (see Modelfiles).
- **7B+** models are out of scope on 8 GB; use a higher-RAM machine later.

---

## How weights are shared (no double download from registry)

1. **llama.cpp** downloads GGUF into the Hugging Face cache via `-hf`.
2. **Ollama** imports the **same** `.gguf` file with `ollama create -f Modelfile` (see below).

HF cache layout (typical):

```text
~/.cache/huggingface/hub/models--Qwen--Qwen2.5-3B-Instruct-GGUF/snapshots/<snapshot-id>/qwen2.5-3b-instruct-q4_k_m.gguf
~/.cache/huggingface/hub/models--Qwen--Qwen2.5-0.5B-Instruct-GGUF/snapshots/<snapshot-id>/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

Snapshot IDs change when the cache is refreshed. After download, resolve paths with:

```bash
find ~/.cache/huggingface/hub/models--Qwen--Qwen2.5-3B-Instruct-GGUF -name '*.gguf'
find ~/.cache/huggingface/hub/models--Qwen--Qwen2.5-0.5B-Instruct-GGUF -name '*.gguf'
```

Update the `FROM` line in the Modelfiles in this directory, then recreate Ollama models.

---

## First-time setup (new developer)

### 1. Install runtimes

```bash
brew install llama.cpp
# Install Ollama from https://ollama.com/download and ensure the app/daemon is running
```

### 2. Download weights (llama.cpp → HF cache)

```bash
# Primary (~2 GB download)
llama-cli -hf Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M -p "ready" -n 8 --temp 0

# Fast (~0.5 GB download)
llama-cli -hf Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M -p "ready" -n 8 --temp 0
```

(First run may take several minutes on CPU; you can cancel after the download completes.)

### 3. Point Modelfiles at your GGUF paths

Edit `local-ai/Modelfile.qwen-3b` and `local-ai/Modelfile.qwen-0.5b` — set `FROM` to the absolute path from `find` above.

### 4. Register with Ollama

From the repository root:

```bash
ollama create qwen2.5-3b-instruct -f local-ai/Modelfile.qwen-3b
ollama create qwen2.5-0.5b-instruct -f local-ai/Modelfile.qwen-0.5b
ollama list
```

### 5. Smoke test

```bash
ollama run qwen2.5-3b-instruct "Reply with one word: ok"
```

Or HTTP API (port 11434):

```bash
curl -s http://127.0.0.1:11434/api/generate -d '{
  "model": "qwen2.5-3b-instruct",
  "prompt": "Say ok",
  "stream": false
}'
```

---

## Daily commands

| Goal | Command |
|------|---------|
| Chat (primary) | `ollama run qwen2.5-3b-instruct` |
| Chat (fast) | `ollama run qwen2.5-0.5b-instruct` |
| llama.cpp (primary) | `llama-cli -hf Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M` |
| llama.cpp (fast) | `llama-cli -hf Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M` |
| OpenAI-compatible server | `llama-server -hf Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M` |

For non-interactive / scripts, prefer **`llama-completion`** over `llama-cli` (see [llama.cpp README](https://github.com/ggml-org/llama.cpp)).

---

## Modelfile parameters (what we changed from defaults)

| Parameter | 3B | 0.5B | Why |
|-----------|-----|------|-----|
| `num_ctx` | 2048 | 2048 | Limits RAM on 8 GB systems |
| `temperature` | 0.2 | 0 | 3B: slight flexibility for risk reasoning; 0.5B: deterministic smoke tests |
| `TEMPLATE` | Qwen2.5 ChatML | same | Matches instruct format |
| `SYSTEM` | Sanctum runtime agent | generic assistant | 3B: action risk evaluation |

Files: [`Modelfile.qwen-3b`](./Modelfile.qwen-3b), [`Modelfile.qwen-0.5b`](./Modelfile.qwen-0.5b).

---

## Alternative: Ollama registry (simpler, separate copy)

If you skip shared HF cache import:

```bash
ollama pull qwen2.5:3b
ollama pull qwen2.5:0.5b
```

This downloads **separate** blobs into `~/.ollama` (extra disk). Prefer **Modelfile + HF cache** when using both llama.cpp and Ollama.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ollama create` fails on `FROM` | Re-run `find` for `.gguf`; update Modelfile path |
| Very slow on 8 GB | Use 0.5B; reduce `num_ctx`; quit browser tabs |
| `llama-cli` hangs in chat | Use `llama-completion` or `/exit`; prefer Ollama API for scripts |
| Out of disk | 3B + 0.5B + Ollama copies ≈ **3–4 GB** minimum in caches |

---

## Connect to Sanctum Runtime

Point the API at your Ollama model (any name you created):

```bash
# .env
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-3b-instruct   # or qwen2.5-0.5b-instruct, llama3.2, …
# optional override:
# SANCTUM_RISK_PROVIDER=ollama
# SANCTUM_RISK_MODEL=qwen2.5-3b-instruct
```

Use **heuristics only** (no LLM): `SANCTUM_RISK_PROVIDER=none`.

Use a **cloud/gateway** model instead: `SANCTUM_RISK_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_BASE_URL` — see [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md).

Verify the runtime sees your model: `curl http://127.0.0.1:3001/v1/status` → `riskModelConnected: true`.

---

## Related docs

- [`DEVELOPER_GUIDE.md`](../DEVELOPER_GUIDE.md) — full OSS capabilities  
- [`DEVELOPMENT.md`](../DEVELOPMENT.md) — repo dev entry point  
- [`DEVELOPER_GUIDE.md`](../DEVELOPER_GUIDE.md) — risk models and offline mode

---

*Last verified: 2026-05-15 — Qwen2.5 3B/0.5B Instruct Q4_K_M on macOS 14, 8 GB RAM, Intel CPU.*
