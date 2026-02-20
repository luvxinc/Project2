#!/usr/bin/env bash
set -euo pipefail

# /renew executor: update existing library knowledge by source provenance.
# Usage: library-renew.sh <slug> [ref=HEAD]

SLUG="${1:-}"
REF="${2:-HEAD}"
[ -n "$SLUG" ] || { echo "Usage: $0 <slug> [ref]"; exit 2; }

ROOT="/Users/aaron/Developer/MGMTV2/.agent"
LIB_DIR="$ROOT/warehouse/tools/$SLUG"
META="$LIB_DIR/meta.json"
[ -f "$META" ] || { echo "meta.json not found: $META"; exit 1; }

REPO_URL="$(python3 - <<PY
import json
print(json.load(open('$META'))['source']['repo'])
PY
)"
if [ "$REPO_URL" = "unknown" ] || [ -z "$REPO_URL" ]; then
  echo "❌ cannot renew $SLUG: source.repo is unknown in meta.json"
  echo "Please re-ingest with repository URL first."
  exit 1
fi
OLD_COMMIT="$(python3 - <<PY
import json
print(json.load(open('$META'))['source']['commit'])
PY
)"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP/repo" 2>/dev/null || git clone --depth 1 "$REPO_URL" "$TMP/repo"
NEW_COMMIT="$(git -C "$TMP/repo" rev-parse HEAD)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
  echo "ℹ️ no update: commit unchanged ($NEW_COMMIT)"
  exit 0
fi

README_SRC=""
for f in README.md readme.md Readme.md; do
  if [ -f "$TMP/repo/$f" ]; then README_SRC="$f"; break; fi
done

if [ -n "$README_SRC" ]; then
  {
    echo "# $SLUG — Overview"
    echo
    echo "> source_repo: $REPO_URL"
    echo "> source_path: $README_SRC"
    echo "> source_commit: $NEW_COMMIT"
    echo "> extracted_at: $NOW"
    echo
    echo "## When to load"
    echo "Use when you need high-level understanding of $SLUG."
    echo
    echo "## Extract"
    sed -n '1,220p' "$TMP/repo/$README_SRC"
  } > "$LIB_DIR/01-overview.md"
fi

{
  echo "# $SLUG — Structure"
  echo
  echo "> source_repo: $REPO_URL"
  echo "> source_path: repository tree"
  echo "> source_commit: $NEW_COMMIT"
  echo "> extracted_at: $NOW"
  echo
  echo "## When to load"
  echo "Use when you need module layout and entry points."
  echo
  echo "## Top-level tree"
  (cd "$TMP/repo" && find . -maxdepth 3 -type f | sed 's|^./||' | head -n 300)
} > "$LIB_DIR/02-structure.md"

python3 - <<PY
import json
meta=json.load(open('$META'))
meta['source']['ref']='$REF'
meta['source']['commit']='$NEW_COMMIT'
meta['source']['extractedAt']='$NOW'
json.dump(meta,open('$META','w'),ensure_ascii=False,indent=2)
open('$META','a').write('\n')
PY

echo "✅ renewed $SLUG: $OLD_COMMIT -> $NEW_COMMIT"
