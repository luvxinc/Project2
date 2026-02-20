#!/usr/bin/env bash
set -euo pipefail

# PreToolUse guard (CLI)
# Usage: hook-pretool.sh "<command>"
CMD="${1:-}"
[ -n "$CMD" ] || { echo "command required"; exit 2; }

# 1) high-risk command policy
POLICY="/Users/aaron/Developer/MGMTV2/.claude/core/scripts/tool-policy-runtime.sh"
if [ -x "$POLICY" ]; then
  POLICY_MODE=enforce "$POLICY" check "$CMD" >/tmp/pretool-policy.json 2>&1 || {
    cat /tmp/pretool-policy.json
    echo "❌ pretool blocked by policy"
    exit 1
  }
fi

echo "✅ pretool passed"
