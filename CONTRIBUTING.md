# Contributing

Thanks for helping build Sanctum’s **open-core** runtime.

## Before you open a PR

1. Read [OPEN_CORE.md](./OPEN_CORE.md) — stay within the public layer unless PRD is updated.
2. Map changes to [PRD.md](./PRD.md) sections (see [DEVELOPMENT.md](./DEVELOPMENT.md)).
3. If you add developer-facing behavior, update [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).
3. Run checks locally:

```bash
npm run dev:runtime   # in one terminal
npm run smoke
npm run example:agent
```

## Scope boundaries

| OK in this repo | Use a private repo / enterprise track later |
|-----------------|---------------------------------------------|
| SDK, policy engine, local Ollama bridge | Proprietary risk models & fleet intelligence |
| Community dashboard | Enterprise fleet UI & compliance packs |
| Agent adapter & examples | Hosted Sanctum Cloud control plane |

## Issues

- **Bugs / questions:** [runtime help](.github/ISSUE_TEMPLATE/runtime-help.md)
- **Enterprise / design partners:** [early access](.github/ISSUE_TEMPLATE/early-access.md)
