#!/usr/bin/env bash
set -euo pipefail

# Unified machine-readable audit report (JSON)
# Usage: kernel-audit-json.sh [repo-root] [project-root]

REPO_ROOT="${1:-/Users/aaron/Developer/MGMTV2}"
PROJECT_ROOT="${2:-$REPO_ROOT/.claude/projects/mgmt}"
TMP_DIR="${TMPDIR:-/tmp}"
WORK="$TMP_DIR/kernel-audit-json-$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

run_step() {
  local key="$1"; shift
  local out="$WORK/${key}.out"
  local code=0
  (cd "$REPO_ROOT" && "$@") >"$out" 2>&1 || code=$?
  python3 - "$key" "$code" "$out" <<'PY'
import json,sys,pathlib
key=sys.argv[1]; code=int(sys.argv[2]); p=pathlib.Path(sys.argv[3])
text=p.read_text(errors='ignore') if p.exists() else ''
status='pass' if code==0 else 'fail'
print(json.dumps({
  'name': key,
  'status': status,
  'exitCode': code,
  'summary': '\n'.join(text.strip().splitlines()[:20])
}, ensure_ascii=False))
PY
}

j1=$(run_step agentDocAudit "$REPO_ROOT/.claude/core/scripts/agent-doc-audit.sh" "$REPO_ROOT/.agent")
j2=$(run_step memoryDedupeAudit "$REPO_ROOT/.claude/core/scripts/memory-dedupe-audit.sh" "$PROJECT_ROOT")
j3=$(run_step artifactLifecycleAudit "$REPO_ROOT/.claude/core/scripts/artifact-lifecycle-audit.sh" "$PROJECT_ROOT" --tmp-only)

python3 - "$j1" "$j2" "$j3" <<'PY'
import json,sys
steps=[json.loads(x) for x in sys.argv[1:]]
ok=all(s['status']=='pass' for s in steps)
print(json.dumps({
  'kind':'kernel.audit.report.v1',
  'overall':'pass' if ok else 'fail',
  'steps':steps
}, ensure_ascii=False, indent=2))
PY
