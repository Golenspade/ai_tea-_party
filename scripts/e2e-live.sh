#!/usr/bin/env bash
# 全栈 live E2E：真实 backend(:3004) + Playwright 拉起 frontend(:3001)
# 允许真实 LLM：在仓库根 .env 配置 DEEPSEEK_API_KEY / GEMINI_API_KEY 后重启 backend。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${E2E_API_BASE_URL:-http://127.0.0.1:3004}"

echo "[e2e-live] checking backend at ${API_BASE}"
if ! curl -sf "${API_BASE}/api/health" >/dev/null; then
  echo "[e2e-live] backend not healthy. Start with: pnpm --filter ai-tea-party-backend dev" >&2
  exit 1
fi

cd "${ROOT}/frontend"
export E2E_LIVE=1
export E2E_API_BASE_URL="${API_BASE}"

if [[ "${1:-}" == "--llm" ]]; then
  echo "[e2e-live] running LLM-dependent suite"
  npm run e2e:live:llm
else
  echo "[e2e-live] running full live suite (LLM tests auto-skip without keys)"
  npm run e2e:live
fi
