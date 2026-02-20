#!/usr/bin/env bash
set -euo pipefail

# Context budgeter v1
# Usage:
#   context-budgeter.sh plan <intent> [budget_tokens]
#   context-budgeter.sh enforce <used_tokens> [budget_tokens]
#
# Policy:
# - default budget: 8000 tokens
# - soft cap at 80%: switch to index-only + top-k slices
# - hard cap at 100%: block full-load, allow only minimal path

MODE="${1:-plan}"
ARG1="${2:-}"
BUDGET="${3:-8000}"

soft_cap=$(( BUDGET * 80 / 100 ))
hard_cap=$BUDGET

json_plan() {
  local intent="$1"
  cat <<JSON
{
  "kind": "context.budget.plan.v1",
  "intent": "${intent}",
  "budgetTokens": ${BUDGET},
  "caps": {
    "soft": ${soft_cap},
    "hard": ${hard_cap}
  },
  "strategy": {
    "default": "catalog -> index -> topK_slices",
    "topK": 2,
    "maxKBPerSlice": 12,
    "whenSoftExceeded": "index_only_or_reduce_topK_to_1",
    "whenHardExceeded": "block_full_load_and_require_minimal_path"
  }
}
JSON
}

json_enforce() {
  local used="$1"
  local mode="normal"
  local action="allow"
  if [ "$used" -ge "$hard_cap" ]; then
    mode="hard_limit"
    action="block_full_load"
  elif [ "$used" -ge "$soft_cap" ]; then
    mode="soft_limit"
    action="degrade_to_minimal"
  fi

  cat <<JSON
{
  "kind": "context.budget.enforce.v1",
  "usedTokens": ${used},
  "budgetTokens": ${BUDGET},
  "mode": "${mode}",
  "action": "${action}",
  "caps": {"soft": ${soft_cap}, "hard": ${hard_cap}}
}
JSON
}

case "$MODE" in
  plan)
    json_plan "$ARG1"
    ;;
  enforce)
    [ -n "$ARG1" ] || { echo "used_tokens required"; exit 2; }
    json_enforce "$ARG1"
    ;;
  *)
    echo "Usage: $0 plan <intent> [budget_tokens] | enforce <used_tokens> [budget_tokens]"
    exit 2
    ;;
esac
