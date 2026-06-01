#!/usr/bin/env bash
# Push notification API E2E via curl.
# Requires: .env with Supabase keys (same as e2e-bootstrap).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${SANCTUM_API_URL:-https://api.sanctumruntime.com}"
API="${API%/}"
DASH="${DASHBOARD_URL:-https://console.sanctumruntime.com}"
DASH="${DASH%/}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
pass=0
fail=0

ok() { echo -e "${GREEN}✓${NC} $1"; pass=$((pass + 1)); }
bad() { echo -e "${RED}✗${NC} $1${2:+ — $2}"; fail=$((fail + 1)); }

echo "Push E2E (curl) → API ${API}"
echo "Dashboard probe → ${DASH}"
echo ""

# ── JWT for dashboard user ───────────────────────────────────────────────────
JWT="$(node "${ROOT}/scripts/push-e2e-jwt.mjs" 2>/dev/null | tr -d '\n\r')"
if [[ -z "${JWT}" ]]; then
  bad "JWT bootstrap" "run from repo root with .env Supabase keys"
  exit 1
fi
ok "operator JWT obtained"

# ── 1. Public VAPID key ──────────────────────────────────────────────────────
VAPID_BODY="$(curl -sS "${API}/v1/push/vapid-key")"
VAPID_KEY="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.publicKey||'')" "$VAPID_BODY")"
if [[ -n "${VAPID_KEY}" ]]; then
  ok "GET /v1/push/vapid-key → publicKey present"
else
  bad "GET /v1/push/vapid-key" "$VAPID_BODY"
fi

# ── 2. Auth gates ────────────────────────────────────────────────────────────
STATUS_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "${API}/v1/push/status")"
if [[ "${STATUS_CODE}" == "401" ]]; then
  ok "GET /v1/push/status without auth → 401"
else
  bad "GET /v1/push/status without auth" "expected 401 got ${STATUS_CODE}"
fi

SUB_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${API}/v1/push/subscribe" \
  -H 'Content-Type: application/json' -d '{}')"
if [[ "${SUB_CODE}" == "401" ]]; then
  ok "POST /v1/push/subscribe without auth → 401"
else
  bad "POST /v1/push/subscribe without auth" "expected 401 got ${SUB_CODE}"
fi

# ── 3. Invalid body ──────────────────────────────────────────────────────────
BAD_SUB="$(curl -sS -w '\n%{http_code}' -X POST "${API}/v1/push/subscribe" \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{"subscription":{"endpoint":"not-a-url"}}')"
BAD_SUB_CODE="${BAD_SUB##*$'\n'}"
if [[ "${BAD_SUB_CODE}" == "400" ]]; then
  ok "POST /v1/push/subscribe invalid body → 400"
else
  bad "POST /v1/push/subscribe invalid body" "expected 400 got ${BAD_SUB_CODE}"
fi

# ── 4. Register mock device (API persistence) ───────────────────────────────
MOCK_ENDPOINT="https://fcm.googleapis.com/fcm/send/e2e-curl-$(date +%s)-$$"
MOCK_PAYLOAD="$(MOCK_ENDPOINT="${MOCK_ENDPOINT}" node -e '
  console.log(JSON.stringify({
    subscription: {
      endpoint: process.env.MOCK_ENDPOINT,
      keys: {
        p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjHgSnf5dS7nQLUy0f6Uz9KqWQ7ONsrud4PNI",
        auth: "tBHItJI5svbpez7KI4CCXg",
      },
    },
    userAgent: "push-e2e-curl/1.0",
  }))
')"
SUB_BODY="$(curl -sS -X POST "${API}/v1/push/subscribe" \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d "${MOCK_PAYLOAD}")"
if echo "${SUB_BODY}" | grep -q '"ok":true'; then
  ok "POST /v1/push/subscribe mock device → ok"
else
  bad "POST /v1/push/subscribe mock device" "${SUB_BODY}"
fi

# ── 5. Status with devices ───────────────────────────────────────────────────
STATUS_BODY="$(curl -sS "${API}/v1/push/status" -H "Authorization: Bearer ${JWT}")"
DEVICE_COUNT="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.deviceCount??0))" "$STATUS_BODY")"
if [[ "${DEVICE_COUNT}" -ge 1 ]]; then
  ok "GET /v1/push/status → deviceCount=${DEVICE_COUNT}"
else
  bad "GET /v1/push/status" "${STATUS_BODY}"
fi

if echo "${STATUS_BODY}" | grep -q '"pushEnabled":true'; then
  ok "GET /v1/push/status → pushEnabled true"
else
  bad "GET /v1/push/status pushEnabled" "${STATUS_BODY}"
fi

# ── 6. Test push delivery (mock endpoint → expect 502 or 409, not 401/500) ─
TEST_OUT="$(curl -sS -w '\n%{http_code}' -X POST "${API}/v1/push/test" \
  -H "Authorization: Bearer ${JWT}")"
TEST_CODE="${TEST_OUT##*$'\n'}"
TEST_JSON="${TEST_OUT%$'\n'*}"
case "${TEST_CODE}" in
  200)
    ok "POST /v1/push/test → 200 delivered (${TEST_JSON})"
    ;;
  409)
    ok "POST /v1/push/test → 409 stale/no subscription (acceptable for mock endpoint)"
    ;;
  502)
    ok "POST /v1/push/test → 502 push_delivery_failed (expected for fake FCM endpoint)"
    ;;
  *)
    bad "POST /v1/push/test" "HTTP ${TEST_CODE} ${TEST_JSON}"
    ;;
esac

# ── 7. Unsubscribe mock device ───────────────────────────────────────────────
UNSUB_PAYLOAD="$(MOCK_ENDPOINT="${MOCK_ENDPOINT}" node -e 'console.log(JSON.stringify({ endpoint: process.env.MOCK_ENDPOINT }))')"
UNSUB_BODY="$(curl -sS -X DELETE "${API}/v1/push/unsubscribe" \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d "${UNSUB_PAYLOAD}")"
if echo "${UNSUB_BODY}" | grep -q '"ok":true'; then
  ok "DELETE /v1/push/unsubscribe mock device → ok"
else
  bad "DELETE /v1/push/unsubscribe" "${UNSUB_BODY}"
fi

# ── 8. Dashboard SW deploy probe ─────────────────────────────────────────────
SW="$(curl -sS "${DASH}/sw.js?probe=$(date +%s)" )"
if echo "${SW}" | grep -q 'showNotification' && echo "${SW}" | grep -Eq 'if\(![a-zA-Z0-9_$]+\.data\)return\{\}|if \(!event\.data\) return \{\}'; then
  ok "dashboard /sw.js handles empty push payloads"
elif echo "${SW}" | grep -Eq 'if\(![a-zA-Z0-9_$]+\.data\)return;|if \(!event\.data\) return$'; then
  bad "dashboard /sw.js" "still has early-return push bug — redeploy sanctum-dashboard"
elif echo "${SW}" | grep -q 'parsePushPayload'; then
  ok "dashboard /sw.js includes fixed push handler (parsePushPayload)"
else
  bad "dashboard /sw.js" "could not detect push handler version"
fi

SW_CACHE="$(curl -sSI "${DASH}/sw.js" | tr -d '\r' | grep -i '^cache-control:' || true)"
if echo "${SW_CACHE}" | grep -qi 'must-revalidate'; then
  ok "dashboard /sw.js Cache-Control must-revalidate"
else
  bad "dashboard /sw.js cache" "${SW_CACHE:-missing Cache-Control}"
fi

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ "${fail}" -eq 0 ]]
