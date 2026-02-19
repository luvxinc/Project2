#!/usr/bin/env bash
set -euo pipefail

# QA Gate v2 (non-destructive)
# Purpose: run standardized verification stages and print a compact report.
# Policy: Integration tests are mandatory for release gate.

ROOT="${1:-.}"
cd "$ROOT"

ok() { printf "✅ %s\n" "$1"; }
warn() { printf "⚠️  %s\n" "$1"; }
fail() { printf "❌ %s\n" "$1"; exit 1; }

run_step() {
  local name="$1"
  shift
  echo "\n==> $name"
  if "$@"; then
    ok "$name"
  else
    fail "$name"
  fi
}

SAFE_EXEC="${SAFE_EXEC:-/Users/aaron/Developer/MGMTV2/.agent/core/scripts/safe-exec.sh}"

TIMEOUT_PROFILE="${TIMEOUT_PROFILE:-/Users/aaron/Developer/MGMTV2/.agent/core/scripts/qa-timeout-profile.env}"
[ -f "$TIMEOUT_PROFILE" ] && source "$TIMEOUT_PROFILE"

QA_TIMEOUT_BUILD="${QA_TIMEOUT_BUILD:-900}"
QA_IDLE_BUILD="${QA_IDLE_BUILD:-60}"
QA_TIMEOUT_TYPE="${QA_TIMEOUT_TYPE:-300}"
QA_IDLE_TYPE="${QA_IDLE_TYPE:-45}"
QA_TIMEOUT_LINT="${QA_TIMEOUT_LINT:-600}"
QA_IDLE_LINT="${QA_IDLE_LINT:-60}"
QA_TIMEOUT_UNIT="${QA_TIMEOUT_UNIT:-900}"
QA_IDLE_UNIT="${QA_IDLE_UNIT:-60}"
QA_TIMEOUT_INTEGRATION="${QA_TIMEOUT_INTEGRATION:-1200}"
QA_IDLE_INTEGRATION="${QA_IDLE_INTEGRATION:-60}"
QA_TIMEOUT_E2E="${QA_TIMEOUT_E2E:-1800}"
QA_IDLE_E2E="${QA_IDLE_E2E:-60}"
QA_TIMEOUT_SECURITY="${QA_TIMEOUT_SECURITY:-600}"
QA_IDLE_SECURITY="${QA_IDLE_SECURITY:-60}"
run_safe() {
  local t="${1:-90}"
  local idle="${2:-45}"
  shift 2
  "$SAFE_EXEC" --timeout "$t" --idle-timeout "$idle" --retries 0 -- "$@"
}

has_root_script() {
  local script_name="$1"
  node -e "const p=require('./package.json'); process.exit((p.scripts&&p.scripts['${script_name}'])?0:1)" 2>/dev/null
}

has_web_script() {
  local script_name="$1"
  [ -f "apps/web/package.json" ] || return 1
  node -e "const p=require('./apps/web/package.json'); process.exit((p.scripts&&p.scripts['${script_name}'])?0:1)" 2>/dev/null
}

echo "🔍 QA Gate started at $(date '+%Y-%m-%d %H:%M:%S')"
echo "📁 Root: $(pwd)"

# 1) Backend build (if present)
if [ -f "./gradlew" ]; then
  run_step "Backend build (Gradle)" run_safe "$QA_TIMEOUT_BUILD" "$QA_IDLE_BUILD" ./gradlew build --no-daemon
else
  warn "Skip backend build: ./gradlew not found"
fi

# 2) Frontend build (if present)
if [ -d "apps/web" ] && [ -f "apps/web/package.json" ]; then
  run_step "Frontend build" run_safe "$QA_TIMEOUT_BUILD" "$QA_IDLE_BUILD" bash -lc "cd apps/web && pnpm build"
else
  warn "Skip frontend build: apps/web not found"
fi

# 3) Type check
if [ -f "tsconfig.json" ]; then
  run_step "Type check (root)" run_safe "$QA_TIMEOUT_TYPE" "$QA_IDLE_TYPE" pnpm tsc --noEmit
elif [ -f "apps/web/tsconfig.json" ]; then
  run_step "Type check (apps/web)" run_safe "$QA_TIMEOUT_TYPE" "$QA_IDLE_TYPE" bash -lc "cd apps/web && pnpm tsc --noEmit"
else
  warn "Skip type check: tsconfig not found"
fi

# 4) Lint
if has_root_script lint; then
  run_step "Lint" run_safe "$QA_TIMEOUT_LINT" "$QA_IDLE_LINT" pnpm lint
else
  warn "Skip lint: package.json scripts.lint not found"
fi

# 5) Unit tests (required: test:unit OR test fallback)
if has_root_script test:unit; then
  run_step "Unit tests" run_safe "$QA_TIMEOUT_UNIT" "$QA_IDLE_UNIT" pnpm run test:unit
elif has_web_script test:unit; then
  run_step "Unit tests (apps/web)" run_safe "$QA_TIMEOUT_UNIT" "$QA_IDLE_UNIT" bash -lc "cd apps/web && pnpm run test:unit"
elif has_root_script test; then
  run_step "Unit tests (fallback test)" run_safe "$QA_TIMEOUT_UNIT" "$QA_IDLE_UNIT" pnpm test
else
  fail "Unit tests: missing script test:unit/test"
fi

# 6) Integration tests (MANDATORY)
if has_root_script test:integration; then
  run_step "Integration tests" run_safe "$QA_TIMEOUT_INTEGRATION" "$QA_IDLE_INTEGRATION" pnpm run test:integration
elif has_web_script test:integration; then
  run_step "Integration tests (apps/web)" run_safe "$QA_TIMEOUT_INTEGRATION" "$QA_IDLE_INTEGRATION" bash -lc "cd apps/web && pnpm run test:integration"
else
  fail "Integration tests: missing script test:integration"
fi

# 7) E2E tests (recommended, non-blocking by default)
if has_root_script test:e2e; then
  run_step "E2E tests" run_safe "$QA_TIMEOUT_E2E" "$QA_IDLE_E2E" pnpm run test:e2e
elif has_web_script test:e2e; then
  run_step "E2E tests (apps/web)" run_safe "$QA_TIMEOUT_E2E" "$QA_IDLE_E2E" bash -lc "cd apps/web && pnpm run test:e2e"
else
  warn "Skip E2E tests: scripts.test:e2e not found"
fi

# 8) Security scan
if command -v pnpm >/dev/null 2>&1; then
  echo "\n==> Security audit"
  if run_safe "$QA_TIMEOUT_SECURITY" "$QA_IDLE_SECURITY" pnpm audit --prod --audit-level high; then
    ok "Security audit"
  else
    fail "Security audit"
  fi
else
  warn "Skip security audit: pnpm not found"
fi

# 9) Extra security/compliance audit (configurable)
if [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/security-extra-audit.sh" ]; then
  echo "\n==> Security extra audit"
  QA_SECURITY_MODE="${QA_SECURITY_MODE:-warn}"          # warn|enforce
  QA_SEMGREP_SCOPE="${QA_SEMGREP_SCOPE:-diff}"         # diff|full
  QA_SEMGREP_ENFORCE_PROFILE="${QA_SEMGREP_ENFORCE_PROFILE:-critical}" # critical|all

  if run_safe "$QA_TIMEOUT_SECURITY" "$QA_IDLE_SECURITY" env \
      SEMGREP_SCOPE="$QA_SEMGREP_SCOPE" \
      SEMGREP_ENFORCE_PROFILE="$QA_SEMGREP_ENFORCE_PROFILE" \
      /Users/aaron/Developer/MGMTV2/.agent/core/scripts/security-extra-audit.sh . "$QA_SECURITY_MODE"; then
    ok "Security extra audit"
  else
    if [ "$QA_SECURITY_MODE" = "enforce" ]; then
      fail "Security extra audit"
    else
      warn "Security extra audit warnings"
    fi
  fi
else
  warn "Skip security extra audit: script not found"
fi

# 10) Governance hardening audits (phased: warn -> enforce)
QA_GOVERNANCE_MODE="${QA_GOVERNANCE_MODE:-warn}" # warn|enforce
QA_PROJECT_ROOT="${QA_PROJECT_ROOT:-/Users/aaron/Developer/MGMTV2/.agent/projects/mgmt}"
QA_SCOPE_ALLOWLIST_FILE="${QA_SCOPE_ALLOWLIST_FILE:-/Users/aaron/Developer/MGMTV2/.agent/core/reference/scope-allowlist.example.txt}"
QA_ACCEPTANCE_MATRIX_FILE="${QA_ACCEPTANCE_MATRIX_FILE:-}"
QA_REPORT_FILE="${QA_REPORT_FILE:-}"

# auto-resolve scope contract from task-id when not explicitly provided
if [ -z "${QA_SCOPE_CONTRACT_FILE:-}" ] && [ -n "${QA_TASK_ID:-}" ]; then
  candidate="$QA_PROJECT_ROOT/data/tmp/$QA_TASK_ID/scope-contract.txt"
  if [ -f "$candidate" ]; then
    QA_SCOPE_CONTRACT_FILE="$candidate"
    echo "ℹ️ auto scope contract: $QA_SCOPE_CONTRACT_FILE"
  fi
fi

run_governance() {
  local label="$1"; shift
  if "$@"; then
    ok "$label"
  else
    if [ "$QA_GOVERNANCE_MODE" = "enforce" ]; then
      fail "$label"
    else
      warn "$label (warn mode)"
    fi
  fi
}

if [ -n "${QA_SCOPE_CONTRACT_FILE:-}" ] && [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/scope-contract-audit.sh" ]; then
  run_governance "Scope contract audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/scope-contract-audit.sh "$QA_SCOPE_CONTRACT_FILE"
elif [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/scope-audit.sh" ]; then
  run_governance "Scope audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/scope-audit.sh "$QA_SCOPE_ALLOWLIST_FILE" "${QA_SCOPE_BASE_REF:-HEAD~1}"
else
  warn "Skip scope audit: script missing"
fi

if [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/acceptance-audit.sh" ]; then
  if [ -n "$QA_ACCEPTANCE_MATRIX_FILE" ] && [ -f "$QA_ACCEPTANCE_MATRIX_FILE" ]; then
    run_governance "Acceptance audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/acceptance-audit.sh "$QA_ACCEPTANCE_MATRIX_FILE"
  else
    if [ "$QA_GOVERNANCE_MODE" = "enforce" ]; then
      fail "Acceptance audit: QA_ACCEPTANCE_MATRIX_FILE missing"
    else
      warn "Acceptance audit skipped: QA_ACCEPTANCE_MATRIX_FILE missing"
    fi
  fi
else
  warn "Skip acceptance audit: script missing"
fi

if [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/no-guess-audit.sh" ]; then
  if [ -n "$QA_REPORT_FILE" ] && [ -f "$QA_REPORT_FILE" ]; then
    run_governance "No-guess audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/no-guess-audit.sh "$QA_REPORT_FILE"
  else
    if [ "$QA_GOVERNANCE_MODE" = "enforce" ]; then
      fail "No-guess audit: QA_REPORT_FILE missing"
    else
      warn "No-guess audit skipped: QA_REPORT_FILE missing"
    fi
  fi
else
  warn "Skip no-guess audit: script missing"
fi

# delivery gate format must be fixed when report exists
if [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/delivery-gate-format-audit.sh" ] && [ -n "$QA_REPORT_FILE" ] && [ -f "$QA_REPORT_FILE" ]; then
  run_governance "Delivery gate format audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/delivery-gate-format-audit.sh "$QA_REPORT_FILE"
fi

# role output format audits (optional via explicit files)
if [ -n "${QA_CTO_REPORT_FILE:-}" ] && [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/cto-format-audit.sh" ]; then
  run_governance "CTO format audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/cto-format-audit.sh "$QA_CTO_REPORT_FILE"
fi
if [ -n "${QA_ENGINEER_REPORT_FILE:-}" ] && [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/engineer-format-audit.sh" ]; then
  run_governance "Engineer format audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/engineer-format-audit.sh "$QA_ENGINEER_REPORT_FILE"
fi
if [ -n "${QA_QA_REPORT_FILE:-}" ] && [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/qa-format-audit.sh" ]; then
  run_governance "QA format audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/qa-format-audit.sh "$QA_QA_REPORT_FILE"
fi
if [ -n "${QA_GUARD_REPORT_FILE:-}" ] && [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/guard-format-audit.sh" ]; then
  run_governance "Guard format audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/guard-format-audit.sh "$QA_GUARD_REPORT_FILE"
fi
if [ -n "${QA_SHIP_REPORT_FILE:-}" ] && [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/ship-format-audit.sh" ]; then
  run_governance "Ship format audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/ship-format-audit.sh "$QA_SHIP_REPORT_FILE"
fi
if [ -n "${QA_LEARN_REPORT_FILE:-}" ] && [ -x "/Users/aaron/Developer/MGMTV2/.agent/core/scripts/learn-format-audit.sh" ]; then
  run_governance "Learn format audit" /Users/aaron/Developer/MGMTV2/.agent/core/scripts/learn-format-audit.sh "$QA_LEARN_REPORT_FILE"
fi

echo "\n🎯 QA Gate completed successfully"
