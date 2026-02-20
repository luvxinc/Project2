#!/usr/bin/env bash
set -euo pipefail

# Stop hook: final governance check
# Usage: hook-stop.sh <repo-root>
ROOT="${1:-/Users/aaron/Developer/MGMTV2}"
cd "$ROOT"

# enforce minimal end checks
"$ROOT/.claude/core/scripts/artifact-lifecycle-audit.sh" "$ROOT/.claude/projects/mgmt" --enforce-no-audits

echo "✅ stop hook passed"
