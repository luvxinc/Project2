#!/usr/bin/env bash
set -euo pipefail

# No-guess audit: block speculative language without evidence tags
# Usage: no-guess-audit.sh <report.md>
# Evidence tag examples expected in report: Source: path#line OR Command: ...

REPORT="${1:-}"
[ -f "$REPORT" ] || { echo "report not found: $REPORT"; exit 2; }

spec_hits=$(rg -n "可能|应该|大概|猜测|might|probably|likely" "$REPORT" || true)
evidence_hits=$(rg -n "Source:\s+.+#L?[0-9]+|Command:\s+.+|Output:\s+.+" "$REPORT" || true)
unknown_hits=$(rg -n "\bUNKNOWN\b" "$REPORT" || true)

if [ -n "$spec_hits" ] && [ -z "$evidence_hits" ]; then
  echo "❌ no-guess-audit failed: speculative wording without evidence"
  echo "$spec_hits" | head -n 20
  exit 1
fi

if [ -n "$unknown_hits" ]; then
  echo "⚠️ UNKNOWN present (allowed if explicitly unresolved):"
  echo "$unknown_hits" | head -n 20
fi

echo "✅ no-guess-audit passed"
