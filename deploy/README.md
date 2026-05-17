# Sanctum Runtime — Deployment Guide

This directory contains production deployment artefacts for self-hosted and
Kubernetes (Helm) deployments of Sanctum Runtime.

---

## Table of Contents

1. [Docker Compose (self-hosted)](#1-docker-compose-self-hosted)
2. [Helm (Kubernetes)](#2-helm-kubernetes)
3. [Required environment variables](#3-required-environment-variables)
4. [Air-gap deployment](#4-air-gap-deployment)
5. [Health check endpoints](#5-health-check-endpoints)
6. [Upgrade procedure](#6-upgrade-procedure)

---

## 1. Docker Compose (self-hosted)

### Prerequisites

- Docker ≥ 24 and Docker Compose ≥ 2.20
- A Supabase project (external) with the schema applied (`supabase/` directory)
- The dashboard pre-built: `npm run build -w @sanctum/dashboard`

### Quickstart

```bash
# 1. Copy and fill in environment variables
cp .env.example .env
$EDITOR .env

# 2. Build the dashboard (skipped if you already have apps/dashboard/dist)
npm ci && npm run build:sdk && npm run build -w @sanctum/dashboard

# 3. Start the stack
docker compose -f deploy/docker-compose.prod.yml up -d

# 4. Verify
curl http://localhost:3000/health
```

### With Ollama (local risk model)

```bash
docker compose -f deploy/docker-compose.prod.yml --profile with-ollama up -d
# Pull a model after Ollama starts:
docker exec -it <ollama-container-id> ollama pull llama3
```

### Ports

| Service   | Default port | Env override       |
|-----------|--------------|--------------------|
| API       | 3000         | `API_EXTERNAL_PORT` |
| Dashboard | 80           | `HTTP_PORT`         |
| Dashboard | 443          | `HTTPS_PORT`        |
| Ollama    | 11434        | `OLLAMA_PORT`       |

---

## 2. Helm (Kubernetes)

### Prerequisites

- Kubernetes ≥ 1.26
- Helm ≥ 3.12
- `kubectl` configured for the target cluster
- (Optional) cert-manager for automatic TLS

### Install

```bash
# 1. Create a namespace
kubectl create namespace sanctum

# 2. Create a values override (minimum required)
cat > my-values.yaml <<EOF
supabase:
  url: "https://<your-project>.supabase.co"
  anonKey: "<your-anon-key>"
  serviceRoleKey: "<your-service-role-key>"

api:
  env:
    SANCTUM_PUBLIC_API_URL: "https://api.example.com"
    DASHBOARD_URL: "https://dashboard.example.com"
    SANCTUM_CORS_ORIGINS: "https://dashboard.example.com"

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: dashboard.example.com
      paths:
        - path: /
          pathType: Prefix
          service: dashboard
        - path: /api
          pathType: Prefix
          service: api
  tls:
    - secretName: sanctum-tls
      hosts:
        - dashboard.example.com
EOF

# 3. Install the chart
helm install sanctum-runtime deploy/helm/sanctum-runtime \
  --namespace sanctum \
  -f my-values.yaml

# 4. Check rollout
kubectl rollout status deployment/sanctum-runtime-api -n sanctum
```

### Retrieve the auto-generated API key

```bash
kubectl get secret sanctum-runtime \
  -n sanctum \
  -o jsonpath='{.data.sanctum-api-key}' | base64 --decode && echo
```

### Enable autoscaling

```bash
helm upgrade sanctum-runtime deploy/helm/sanctum-runtime \
  --namespace sanctum \
  --reuse-values \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=2 \
  --set autoscaling.maxReplicas=10
```

---

## 3. Required environment variables

| Variable | Description | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (secret) | Yes |
| `SANCTUM_API_KEY` | Master API key for the gateway | Yes (auto-generated if blank) |
| `SANCTUM_API_KEY_PEPPER` | Pepper used when hashing API keys | Recommended |
| `SANCTUM_PUBLIC_API_URL` | Public URL for the API | Yes |
| `DASHBOARD_URL` | Public URL for the dashboard | Yes |
| `SANCTUM_CORS_ORIGINS` | Comma-separated allowed CORS origins | Yes |
| `SANCTUM_OFFLINE_MODE` | Disable external risk calls (`true`/`false`) | No (default `false`) |
| `SANCTUM_RISK_PROVIDER` | Risk model: `none` \| `ollama` | No (default `none`) |
| `OLLAMA_BASE_URL` | Ollama endpoint (used when `SANCTUM_RISK_PROVIDER=ollama`) | No |
| `PADDLE_WEBHOOK_SECRET` | Paddle billing webhook signature secret | No |
| `PADDLE_VENDOR_ID` | Paddle vendor ID | No |
| `PADDLE_SANDBOX` | Use Paddle sandbox (`true`/`false`) | No |

---

## 4. Air-gap deployment

For environments with no outbound internet access:

### Docker Compose (air-gap)

```bash
# On a machine with internet access — save images to tarballs
docker pull node:22-alpine
docker pull nginx:alpine
docker pull ollama/ollama:latest   # optional

docker save node:22-alpine    | gzip > node-22-alpine.tar.gz
docker save nginx:alpine      | gzip > nginx-alpine.tar.gz
docker save ollama/ollama:latest | gzip > ollama-latest.tar.gz   # optional

# Transfer tarballs to the air-gap host, then load them
docker load < node-22-alpine.tar.gz
docker load < nginx-alpine.tar.gz
docker load < ollama-latest.tar.gz   # optional

# Pre-build the dashboard on the internet-connected machine and transfer
# the apps/dashboard/dist directory to the air-gap host.

# Transfer node_modules (or run npm ci offline with a local registry)
# Then start normally:
docker compose -f deploy/docker-compose.prod.yml up -d
```

### Helm (air-gap)

```bash
# 1. Build and push the API image to your internal registry on a connected machine
docker build -t registry.internal/sanctum-runtime:0.1.0 .
docker push registry.internal/sanctum-runtime:0.1.0

# 2. Override the image in values
helm install sanctum-runtime deploy/helm/sanctum-runtime \
  --namespace sanctum \
  --set image.repository=registry.internal/sanctum-runtime \
  --set image.tag=0.1.0 \
  -f my-values.yaml

# 3. For Ollama in-cluster, deploy the official chart pointing to your
#    mirrored image and set ollama.enabled=true, ollama.url=http://ollama:11434
```

---

## 5. Health check endpoints

| Service | Path | Expected response |
|---|---|---|
| API | `GET /health` | `200 OK` with JSON `{"status":"ok"}` |
| Dashboard | `GET /` | `200 OK` (Nginx serves `index.html`) |

Quick smoke test after deployment:

```bash
# Docker Compose
curl -sf http://localhost:3000/health && echo "API OK"

# Kubernetes (port-forward)
kubectl port-forward svc/sanctum-runtime-api 3000:3000 -n sanctum &
curl -sf http://localhost:3000/health && echo "API OK"
```

---

## 6. Upgrade procedure

### Docker Compose

```bash
# Pull latest code
git pull origin main

# Rebuild the dashboard
npm ci && npm run build:sdk && npm run build -w @sanctum/dashboard

# Rolling restart (zero-downtime if you run multiple replicas behind a LB)
docker compose -f deploy/docker-compose.prod.yml pull
docker compose -f deploy/docker-compose.prod.yml up -d --remove-orphans
```

### Helm

```bash
# Upgrade to a new image tag, reusing all other values
helm upgrade sanctum-runtime deploy/helm/sanctum-runtime \
  --namespace sanctum \
  --reuse-values \
  --set image.tag=<new-version>

# Monitor the rollout
kubectl rollout status deployment/sanctum-runtime-api -n sanctum

# Roll back if needed
helm rollback sanctum-runtime --namespace sanctum
```

### Checking chart history

```bash
helm history sanctum-runtime -n sanctum
```
