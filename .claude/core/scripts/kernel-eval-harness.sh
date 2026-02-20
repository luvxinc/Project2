#!/usr/bin/env bash
set -euo pipefail

# Kernel eval harness v1 (deterministic checks)
# Usage: kernel-eval-harness.sh [repo-root]

REPO_ROOT="${1:-/Users/aaron/Developer/MGMTV2}"
SCRIPTS="$REPO_ROOT/.claude/core/scripts"

pass=0
fail=0

run_case() {
  local name="$1"; shift
  if "$@" >/tmp/kernel-eval-${name}.log 2>&1; then
    echo "✅ $name"
    pass=$((pass+1))
  else
    echo "❌ $name"
    sed -n '1,40p' /tmp/kernel-eval-${name}.log || true
    fail=$((fail+1))
  fi
}

# C1: route audit runnable
run_case route_audit "$SCRIPTS/library-route-audit.sh"

# C2: dedupe audit runnable
run_case library_dedupe "$SCRIPTS/library-dedupe-audit.sh"

# C3: doc audit runnable
run_case doc_audit "$SCRIPTS/agent-doc-audit.sh" "$REPO_ROOT/.agent"

# C4: memory dedupe runnable
run_case memory_dedupe "$SCRIPTS/memory-dedupe-audit.sh" "$REPO_ROOT/.claude/projects/mgmt"

# C5: safe-exec watchdog basic
run_case safe_exec "$SCRIPTS/safe-exec.sh" --timeout 5 --idle-timeout 3 -- echo ok

# C6: unified json report valid
run_case json_report python3 - <<PY
import json,subprocess
out=subprocess.check_output(["$SCRIPTS/kernel-audit-json.sh","$REPO_ROOT","$REPO_ROOT/.claude/projects/mgmt"],text=True)
obj=json.loads(out)
assert obj.get("kind") == "kernel.audit.report.v1"
assert "steps" in obj
print("ok")
PY

echo "\n=== KERNEL EVAL SUMMARY ==="
echo "PASS=$pass"
echo "FAIL=$fail"
[ "$fail" -eq 0 ]
