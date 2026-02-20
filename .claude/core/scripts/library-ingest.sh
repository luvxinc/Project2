#!/usr/bin/env bash
set -euo pipefail

# /learn executor: ingest GitHub library into warehouse with slicing+index+provenance.
# Usage:
#   library-ingest.sh <repo-url> <slug> <category> <keywords-comma> [ref=HEAD]

REPO_URL="${1:-}"
SLUG="${2:-}"
CATEGORY="${3:-}"
KEYWORDS_CSV="${4:-}"
REF="${5:-HEAD}"

[ -n "$REPO_URL" ] || { echo "Usage: $0 <repo-url> <slug> <category> <keywords-comma> [ref]"; exit 2; }
[ -n "$SLUG" ] || { echo "missing slug"; exit 2; }
[ -n "$CATEGORY" ] || { echo "missing category"; exit 2; }
[ -n "$KEYWORDS_CSV" ] || { echo "missing keywords"; exit 2; }

ROOT="/Users/aaron/Developer/MGMTV2/.agent"
WH="$ROOT/warehouse"
TOOLS="$WH/tools"
LIB_DIR="$TOOLS/$SLUG"
CAT_JSON="$WH/_CATALOG.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "🔎 ingest $REPO_URL -> $SLUG"

git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP/repo" 2>/dev/null || git clone --depth 1 "$REPO_URL" "$TMP/repo"
COMMIT="$(git -C "$TMP/repo" rev-parse HEAD)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$LIB_DIR"

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
    echo "> source_commit: $COMMIT"
    echo "> extracted_at: $NOW"
    echo "> keywords: $KEYWORDS_CSV"
    echo
    echo "## When to load"
    echo "Use when you need high-level understanding of $SLUG."
    echo
    echo "## Extract"
    sed -n '1,220p' "$TMP/repo/$README_SRC"
  } > "$LIB_DIR/01-overview.md"
else
  cat > "$LIB_DIR/01-overview.md" <<EOF
# $SLUG — Overview

> source_repo: $REPO_URL
> source_path: (none)
> source_commit: $COMMIT
> extracted_at: $NOW
> keywords: $KEYWORDS_CSV

No README found. Use structure slice first.
EOF
fi

{
  echo "# $SLUG — Structure"
  echo
  echo "> source_repo: $REPO_URL"
  echo "> source_path: repository tree"
  echo "> source_commit: $COMMIT"
  echo "> extracted_at: $NOW"
  echo
  echo "## When to load"
  echo "Use when you need module layout and entry points."
  echo
  echo "## Top-level tree"
  (cd "$TMP/repo" && find . -maxdepth 3 -type f | sed 's|^./||' | head -n 300)
} > "$LIB_DIR/02-structure.md"

cat > "$LIB_DIR/INDEX.md" <<EOF
# $SLUG

> category: $CATEGORY
> source_repo: $REPO_URL
> source_commit: $COMMIT
> last_updated: $NOW

## Trigger keywords
$KEYWORDS_CSV

## Slices
- \\`01-overview.md\\` — high-level overview
- \\`02-structure.md\\` — repository structure and modules

## Load policy
- Load INDEX first
- Load max 2 slices per turn
- Avoid full-library loading
EOF

python3 - <<PY
import json, pathlib
lib=pathlib.Path("$LIB_DIR")
keywords=[x.strip() for x in "$KEYWORDS_CSV".split(",") if x.strip()]
meta={
  "slug":"$SLUG",
  "category":"$CATEGORY",
  "keywords":keywords,
  "source":{"repo":"$REPO_URL","ref":"$REF","commit":"$COMMIT","extractedAt":"$NOW"},
  "slices":[
    {"file":"01-overview.md","module":"overview","keywords":keywords,"sourcePath":"README.md"},
    {"file":"02-structure.md","module":"structure","keywords":keywords,"sourcePath":"repository-tree"}
  ]
}
(lib/"meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2))

cat=pathlib.Path("$CAT_JSON")
obj=json.loads(cat.read_text())
idx=f"tools/$SLUG/INDEX.md"
if not any(x.get("slug")=="$SLUG" for x in obj["libraries"]):
  obj["libraries"].append({"slug":"$SLUG","category":"$CATEGORY","keywords":keywords,"index":idx})
if "$CATEGORY" not in obj["categories"]:
  obj["categories"].append("$CATEGORY")
cat.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n")
PY

echo "✅ ingest done: $LIB_DIR"
