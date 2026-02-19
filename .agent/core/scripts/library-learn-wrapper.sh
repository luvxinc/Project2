#!/usr/bin/env bash
set -euo pipefail

# Unified /learn wrapper: auto decide ingest vs renew.
# Usage:
#   library-learn-wrapper.sh <repo-url|slug> [category] [keywords-csv] [ref]
# Examples:
#   library-learn-wrapper.sh https://github.com/org/repo engineering "api,ddd" main
#   library-learn-wrapper.sh claude-mem

INPUT="${1:-}"
CATEGORY="${2:-engineering}"
KEYWORDS="${3:-library,tool,knowledge}"
REF="${4:-HEAD}"

[ -n "$INPUT" ] || { echo "Usage: $0 <repo-url|slug> [category] [keywords-csv] [ref]"; exit 2; }

ROOT="/Users/aaron/Developer/MGMTV2/.agent"
CAT="$ROOT/warehouse/_CATALOG.json"
INGEST="$ROOT/core/scripts/library-ingest.sh"
RENEW="$ROOT/core/scripts/library-renew.sh"
ROUTE_AUDIT="$ROOT/core/scripts/library-route-audit.sh"
DEDUPE_AUDIT="$ROOT/core/scripts/library-dedupe-audit.sh"

RESOLVE="$ROOT/core/scripts/library-resolve.sh"

BEST_SCORE=0
BEST_SLUG=""
precheck_match() {
  local csv="$1"
  IFS=',' read -r -a arr <<< "$csv"
  if out=$("$RESOLVE" "${arr[@]}" 2>/dev/null); then
    echo "ℹ️ capability precheck matches:"
    echo "$out" | sed -n '1,4p'
    local row
    row=$(echo "$out" | sed -n '2p')
    BEST_SCORE=$(echo "$row" | awk -F'	' '{print $1+0}')
    BEST_SLUG=$(echo "$row" | awk -F'	' '{print $2}')
  else
    echo "ℹ️ capability precheck: NO_MATCH"
    BEST_SCORE=0
    BEST_SLUG=""
  fi
}

is_url=0
if [[ "$INPUT" =~ ^https?:// ]]; then is_url=1; fi

precheck_match "$KEYWORDS"

FORCE_INGEST="${FORCE_INGEST:-0}"
if [ "$FORCE_INGEST" != "1" ] && [ "$BEST_SCORE" -ge 2 ] && [ -n "$BEST_SLUG" ] && [ $is_url -eq 1 ]; then
  echo "ℹ️ high overlap detected (score=$BEST_SCORE with $BEST_SLUG) -> skip ingest, keep mapping-only"
  "$ROUTE_AUDIT"
  "$DEDUPE_AUDIT"
  echo "✅ /learn wrapper done (mapping-only)"
  exit 0
fi

slug_from_url() {
  local u="$1"
  u="${u%.git}"
  basename "$u" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

exists_by_slug() {
  local slug="$1"
  python3 - <<PY
import json
cat=json.load(open('$CAT'))
print('1' if any(x.get('slug')=='$slug' for x in cat.get('libraries',[])) else '0')
PY
}

exists_by_repo() {
  local repo="$1"
  python3 - <<PY
import json, pathlib
root=pathlib.Path('$ROOT')
cat=json.load(open('$CAT'))
repo='$repo'
for x in cat.get('libraries',[]):
    m=root/'warehouse'/'tools'/x['slug']/'meta.json'
    if m.exists():
        try:
            j=json.load(open(m))
            if j.get('source',{}).get('repo')==repo:
                print(x['slug']); raise SystemExit
        except Exception:
            pass
print('')
PY
}

source_unknown() {
  local slug="$1"
  python3 - <<PY
import json, pathlib
m=pathlib.Path('$ROOT')/'warehouse'/'tools'/'$slug'/'meta.json'
if not m.exists():
    print('1')
else:
    try:
        j=json.load(open(m))
        print('1' if j.get('source',{}).get('repo') in ('', 'unknown') else '0')
    except Exception:
        print('1')
PY
}

if [ $is_url -eq 1 ]; then
  slug="$(slug_from_url "$INPUT")"
  repo_hit="$(exists_by_repo "$INPUT")"
  if [ -n "$repo_hit" ]; then
    echo "ℹ️ detected existing repo mapping: $repo_hit -> renew"
    "$RENEW" "$repo_hit" "$REF"
  elif [ "$(exists_by_slug "$slug")" = "1" ]; then
    echo "ℹ️ detected existing slug: $slug -> renew"
    "$RENEW" "$slug" "$REF"
  else
    echo "ℹ️ new repository -> ingest ($slug)"
    "$INGEST" "$INPUT" "$slug" "$CATEGORY" "$KEYWORDS" "$REF"
  fi
else
  slug="$INPUT"
  if [ "$(exists_by_slug "$slug")" = "1" ]; then
    if [ "$(source_unknown "$slug")" = "1" ]; then
      echo "❌ slug exists but source unknown: $slug"
      echo "Provide GitHub URL to re-ingest, then renew."
      exit 1
    fi
    echo "ℹ️ slug exists -> renew"
    "$RENEW" "$slug" "$REF"
  else
    echo "❌ slug not found in catalog: $slug"
    echo "Provide a GitHub URL to ingest first."
    exit 1
  fi
fi

"$ROUTE_AUDIT"
"$DEDUPE_AUDIT"

echo "✅ /learn wrapper done"
