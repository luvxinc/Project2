#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/aaron/Developer/MGMTV2/.agent"
CAT="$ROOT/warehouse/_CATALOG.json"

python3 - <<PY
import json, pathlib, sys
root=pathlib.Path('$ROOT')
cat=json.loads(pathlib.Path('$CAT').read_text())
errors=[]
for lib in cat.get('libraries',[]):
    slug=lib['slug']
    idx=root/'warehouse'/lib['index']
    meta=root/'warehouse'/'tools'/slug/'meta.json'
    if not idx.exists(): errors.append(f'missing INDEX: {idx}')
    if not meta.exists(): errors.append(f'missing meta: {meta}')
    kws=lib.get('keywords',[])
    if not kws: errors.append(f'no keywords: {slug}')

if errors:
    print('❌ route audit failed')
    for e in errors: print('-',e)
    sys.exit(1)
print(f"✅ route audit passed ({len(cat.get('libraries',[]))} libraries)")
PY
