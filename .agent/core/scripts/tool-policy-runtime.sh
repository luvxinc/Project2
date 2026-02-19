#!/usr/bin/env bash
set -euo pipefail

# Tool Policy Runtime v1
# Usage:
#   tool-policy-runtime.sh check "<command>"
#   tool-policy-runtime.sh run "<command>"
# Env:
#   POLICY_MODE=warn|enforce (default: enforce)

MODE="${1:-check}"
CMD="${2:-}"
POLICY_MODE="${POLICY_MODE:-enforce}"

[ -n "$CMD" ] || { echo "command required"; exit 2; }

risk="low"
reason=""

# High risk patterns (external send / destructive / privilege)
if [[ "$CMD" =~ (^|[[:space:]])rm([[:space:]]|$) ]] || [[ "$CMD" =~ (^|[[:space:]])sudo([[:space:]]|$) ]] || [[ "$CMD" =~ curl[[:space:]].*(http|https) ]] || [[ "$CMD" =~ (^|[[:space:]])scp([[:space:]]|$) ]] || [[ "$CMD" =~ (^|[[:space:]])ssh([[:space:]]|$) ]]; then
  risk="high"
  reason="destructive_or_external_or_privileged"
fi

# Medium risk patterns
if [[ "$risk" = "low" ]] && ([[ "$CMD" =~ (^|[[:space:]])git[[:space:]]push ]] || [[ "$CMD" =~ (^|[[:space:]])npm[[:space:]]publish ]] || [[ "$CMD" =~ (^|[[:space:]])pnpm[[:space:]]publish ]]); then
  risk="medium"
  reason="external_publish_or_remote_mutation"
fi

decision="allow"
if [[ "$POLICY_MODE" = "enforce" ]]; then
  if [[ "$risk" = "high" ]]; then
    decision="block"
  fi
fi

json_output() {
  python3 - "$risk" "$reason" "$decision" "$CMD" "$POLICY_MODE" <<'PY'
import json,sys
print(json.dumps({
  "kind":"tool.policy.decision.v1",
  "mode":sys.argv[5],
  "risk":sys.argv[1],
  "reason":sys.argv[2],
  "decision":sys.argv[3],
  "command":sys.argv[4]
}, ensure_ascii=False, indent=2))
PY
}

case "$MODE" in
  check)
    json_output
    [[ "$decision" = "block" ]] && exit 1 || exit 0
    ;;
  run)
    if ! "$0" check "$CMD" >/tmp/tool-policy-check.json 2>&1; then
      cat /tmp/tool-policy-check.json
      echo "❌ blocked by policy"
      exit 1
    fi
    # run through safe-exec when available
    SAFE="/Users/aaron/Developer/MGMTV2/.agent/core/scripts/safe-exec.sh"
    if [ -x "$SAFE" ]; then
      "$SAFE" --timeout 120 --idle-timeout 30 -- bash -lc "$CMD"
    else
      bash -lc "$CMD"
    fi
    ;;
  *)
    echo "Usage: $0 check|run \"<command>\""
    exit 2
    ;;
esac
