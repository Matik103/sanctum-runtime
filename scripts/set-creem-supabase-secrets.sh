#!/usr/bin/env bash
# Push Creem env vars from repo .env into Supabase Edge Function secrets.
# Usage: ./scripts/set-creem-supabase-secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

set_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "  skip $name (not in .env)"
    return
  fi
  echo "  set $name"
  supabase secrets set "${name}=${value}"
}

echo "Setting Supabase secrets for Creem Edge Functions..."
set_secret CREEM_API_KEY
set_secret CREEM_API_BASE_URL
set_secret CREEM_WEBHOOK_SECRET
set_secret CREEM_PRODUCT_PERSONAL
set_secret CREEM_PRODUCT_OPERATOR
set_secret CREEM_PRODUCT_TEAM
set_secret CREEM_PRODUCT_ENTERPRISE
set_secret DASHBOARD_URL

echo "Done. Redeploy functions:"
echo "  supabase functions deploy creem-webhook --no-verify-jwt"
echo "  supabase functions deploy creem-checkout"
