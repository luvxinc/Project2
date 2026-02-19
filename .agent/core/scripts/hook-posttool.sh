#!/usr/bin/env bash
set -euo pipefail

# PostToolUse guard (CLI)
# Usage: hook-posttool.sh <repo-root>
ROOT="${1:-/Users/aaron/Developer/MGMTV2}"

# lightweight checks only
"$ROOT/.agent/core/scripts/agent-doc-audit.sh" "$ROOT/.agent" >/tmp/posttool-doc.log 2>&1 || true
"$ROOT/.agent/core/scripts/memory-dedupe-audit.sh" "$ROOT/.agent/projects/mgmt" >/tmp/posttool-mem.log 2>&1 || true

echo "✅ posttool completed"
