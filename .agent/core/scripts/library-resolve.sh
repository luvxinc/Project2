#!/usr/bin/env bash
set -euo pipefail

# Resolve library candidates from warehouse catalog by keywords.
# Usage: library-resolve.sh <keyword1> [keyword2 ...]

ROOT="/Users/aaron/Developer/MGMTV2/.agent"
CAT="$ROOT/warehouse/_CATALOG.json"

[ $# -gt 0 ] || { echo "Usage: $0 <keyword1> [keyword2 ...]"; exit 2; }

python3 - "$CAT" "$@" <<'PY'
import json,sys
cat=json.load(open(sys.argv[1]))
query=[x.lower() for x in sys.argv[2:]]
rows=[]
for lib in cat.get('libraries',[]):
    kws=[k.lower() for k in lib.get('keywords',[])]
    score=sum(1 for q in query if q in kws)
    if score>0:
        rows.append((score,lib['slug'],lib['category'],lib['index'],lib['keywords']))
rows.sort(reverse=True)
if not rows:
    print('NO_MATCH')
    raise SystemExit(1)
print('score\tslug\tcategory\tindex\tkeywords')
for s,slug,c,i,k in rows:
    print(f"{s}\t{slug}\t{c}\t{i}\t{','.join(k)}")
PY
