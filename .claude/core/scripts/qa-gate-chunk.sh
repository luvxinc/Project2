#!/usr/bin/env bash
set -euo pipefail

# Chunked QA gate: focused lint/type + full test-stage parity with qa-gate.
# Usage:
#   qa-gate-chunk.sh <repo-root> <scope>
# Examples:
#   qa-gate-chunk.sh ~/Developer/MGMTV2 "apps/web/src/app/(dashboard)/vma/p-valve/clinical-case/page.tsx"
#   qa-gate-chunk.sh ~/Developer/MGMTV2 "apps/web/src/components/layout"

ROOT="${1:-.}"
SCOPE="${2:-}"

if [ -z "$SCOPE" ]; then
  echo "Usage: $0 <repo-root> <scope-file-or-dir>"
  exit 2
fi

cd "$ROOT"

echo "🔍 Chunk QA Gate"
echo "📁 Root: $(pwd)"
echo "🎯 Scope: $SCOPE"

has_root_script() {
  local script_name="$1"
  node -e "const p=require('./package.json'); process.exit((p.scripts&&p.scripts['${script_name}'])?0:1)" 2>/dev/null
}

has_web_script() {
  local script_name="$1"
  [ -f "apps/web/package.json" ] || return 1
  node -e "const p=require('./apps/web/package.json'); process.exit((p.scripts&&p.scripts['${script_name}'])?0:1)" 2>/dev/null
}

SAFE_EXEC="${SAFE_EXEC:-/Users/aaron/Developer/MGMTV2/.claude/core/scripts/safe-exec.sh}"

TIMEOUT_PROFILE="${TIMEOUT_PROFILE:-/Users/aaron/Developer/MGMTV2/.claude/core/scripts/qa-timeout-profile.env}"
[ -f "$TIMEOUT_PROFILE" ] && source "$TIMEOUT_PROFILE"

QA_TIMEOUT_CHUNK_LINT="${QA_TIMEOUT_CHUNK_LINT:-300}"
QA_IDLE_CHUNK_LINT="${QA_IDLE_CHUNK_LINT:-45}"
QA_TIMEOUT_CHUNK_TYPE="${QA_TIMEOUT_CHUNK_TYPE:-300}"
QA_IDLE_CHUNK_TYPE="${QA_IDLE_CHUNK_TYPE:-45}"
QA_TIMEOUT_CHUNK_UNIT="${QA_TIMEOUT_CHUNK_UNIT:-900}"
QA_IDLE_CHUNK_UNIT="${QA_IDLE_CHUNK_UNIT:-60}"
QA_TIMEOUT_CHUNK_INTEGRATION="${QA_TIMEOUT_CHUNK_INTEGRATION:-1200}"
QA_IDLE_CHUNK_INTEGRATION="${QA_IDLE_CHUNK_INTEGRATION:-60}"
QA_TIMEOUT_CHUNK_E2E="${QA_TIMEOUT_CHUNK_E2E:-1800}"
QA_IDLE_CHUNK_E2E="${QA_IDLE_CHUNK_E2E:-60}"
run_safe() {
  local t="${1:-90}"
  local idle="${2:-45}"
  shift 2
  "$SAFE_EXEC" --timeout "$t" --idle-timeout "$idle" --retries 0 -- "$@"
}

# 1) Scope lint only
run_safe "$QA_TIMEOUT_CHUNK_LINT" "$QA_IDLE_CHUNK_LINT" bash -lc "cd apps/web && pnpm eslint '$ROOT/$SCOPE'"

# 2) Scope-adjacent typecheck (web app only)
run_safe "$QA_TIMEOUT_CHUNK_TYPE" "$QA_IDLE_CHUNK_TYPE" bash -lc "cd apps/web && pnpm tsc --noEmit"

# 3) Unit tests (required: test:unit OR test)
if has_root_script test:unit; then
  run_safe "$QA_TIMEOUT_CHUNK_UNIT" "$QA_IDLE_CHUNK_UNIT" pnpm run test:unit
elif has_web_script test:unit; then
  (cd apps/web && run_safe "$QA_TIMEOUT_CHUNK_UNIT" "$QA_IDLE_CHUNK_UNIT" pnpm run test:unit)
elif has_root_script test; then
  run_safe "$QA_TIMEOUT_CHUNK_UNIT" "$QA_IDLE_CHUNK_UNIT" pnpm test
else
  echo "❌ Unit tests: missing script test:unit/test"
  exit 1
fi

# 4) Integration tests (mandatory)
if has_root_script test:integration; then
  run_safe "$QA_TIMEOUT_CHUNK_INTEGRATION" "$QA_IDLE_CHUNK_INTEGRATION" pnpm run test:integration
elif has_web_script test:integration; then
  (cd apps/web && run_safe "$QA_TIMEOUT_CHUNK_INTEGRATION" "$QA_IDLE_CHUNK_INTEGRATION" pnpm run test:integration)
else
  echo "❌ Integration tests: missing script test:integration"
  exit 1
fi

# 5) E2E tests (recommended, non-blocking)
if has_root_script test:e2e; then
  run_safe "$QA_TIMEOUT_CHUNK_E2E" "$QA_IDLE_CHUNK_E2E" pnpm run test:e2e
elif has_web_script test:e2e; then
  (cd apps/web && run_safe "$QA_TIMEOUT_CHUNK_E2E" "$QA_IDLE_CHUNK_E2E" pnpm run test:e2e)
else
  echo "⚠️  Skip E2E tests: scripts.test:e2e not found"
fi

echo "✅ Chunk passed for: $SCOPE"
