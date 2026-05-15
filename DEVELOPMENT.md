# Development reference

Use this file as the **entry point** for how we build Sanctum in this repository.

## Canonical spec

| Artifact | Role |
|----------|------|
| **[`PRD.md`](./PRD.md)** | Single source of truth: product scope, MVP (**§5**), surfaces (**§6**), external Supabase (**§7**), stack, design system (**§12**), roadmap (**§13**), open-core vs enterprise (**§4.3**), defensibility / moats (**§4.4**), feature verification (**§17**). |
| **[`.cursor/rules/prd-alignment.mdc`](./.cursor/rules/prd-alignment.mdc)** | Cursor **always-on** rule: map work to PRD sections; no silent scope drift; respect Supabase and open-core boundaries. |

## Before you ship a feature

1. Cite the **PRD section(s)** your change satisfies (e.g. §5.1 action verification, §7 Supabase).
2. If the change is **out of MVP or roadmap** unless the PRD is updated, **update `PRD.md` first** or split an intentional follow-up.

## Quick navigation (`PRD.md`)

- **§4.3–§4.4** — Open-core boundaries and competitive / defensibility strategy  
- **§5** — MVP only (action verification, behavioral monitoring, offline, audit logs)  
- **§7** — External Supabase (auth, Postgres, RLS, realtime)  
- **§13** — Week 1–3 engineering sequence  
- **§17** — Feature verification + Cursor enforcement  

Do not treat messaging or stack choices as informal — if it affects product behavior or positioning, it belongs in **`PRD.md`**.

## Local AI (dev / PRD §9)

**Full setup guide:** [`local-ai/MODELS.md`](./local-ai/MODELS.md) (what is installed, first-time setup for new developers, commands, troubleshooting).

Models share **Hugging Face cache** weights with **llama.cpp** and **Ollama** (import via Modelfile, not `ollama pull`). Tuned for **8 GB RAM** on the current dev Mac.

| Role | Model | Ollama | llama.cpp |
|------|--------|--------|-----------|
| **Primary** (agent / scenario demos) | Qwen2.5-**3B**-Instruct Q4_K_M (~2 GB) | `ollama run qwen2.5-3b-instruct` | `llama-cli -hf Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M` |
| **Fast** (plumbing, quick checks) | Qwen2.5-**0.5B**-Instruct Q4_K_M (~0.5 GB) | `ollama run qwen2.5-0.5b-instruct` | `llama-cli -hf Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M` |

**On 8 GB:** use **3B** for realistic local agent behavior; keep **0.5B** when speed matters. Close heavy browser tabs before 3B runs. Keep `num_ctx` at **2048** (see Modelfiles).

Recreate Ollama models if the HF snapshot path changes:

```bash
ollama create qwen2.5-3b-instruct -f local-ai/Modelfile.qwen-3b
ollama create qwen2.5-0.5b-instruct -f local-ai/Modelfile.qwen-0.5b
```

Modelfiles: [`local-ai/Modelfile.qwen-3b`](./local-ai/Modelfile.qwen-3b), [`local-ai/Modelfile.qwen-0.5b`](./local-ai/Modelfile.qwen-0.5b).
