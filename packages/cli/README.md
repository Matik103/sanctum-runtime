# @sanctum-runtime/cli

Thin CLI for operators and CI against a running Sanctum API.

```bash
npm install -g @sanctum-runtime/cli
# or: npx @sanctum-runtime/cli

export SANCTUM_API_URL=https://your-api.onrender.com
export SANCTUM_API_KEY=your-key

sanctum status
sanctum verify --actor demo --action unlock_door --context '{"intent":"test"}' --offline
sanctum policies export --out policies.yaml
```
