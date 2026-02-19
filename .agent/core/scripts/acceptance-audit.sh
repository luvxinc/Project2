#!/usr/bin/env bash
set -euo pipefail

# Acceptance audit: block delivery when requirement matrix has non-PASS rows
# Usage: acceptance-audit.sh <matrix-md>

MATRIX="${1:-}"
[ -f "$MATRIX" ] || { echo "matrix not found: $MATRIX"; exit 2; }

python3 - "$MATRIX" <<'PY'
import re,sys
p=sys.argv[1]
lines=open(p,encoding='utf-8',errors='ignore').read().splitlines()
rows=[l for l in lines if l.strip().startswith('|')]
if len(rows)<3:
    print('❌ acceptance-audit: no matrix rows')
    raise SystemExit(1)

bad=[]
for r in rows[2:]:
    cols=[c.strip() for c in r.split('|')[1:-1]]
    if len(cols)<3:
        continue
    req=cols[0] if len(cols)>0 else ''
    evidence=cols[1] if len(cols)>1 else ''
    status=cols[2].upper() if len(cols)>2 else ''
    if not req:
        continue
    if status!='PASS' or not evidence or evidence in {'-', 'N/A', 'TBD', 'TODO', 'UNKNOWN'}:
        bad.append((req,evidence,status))

if bad:
    print(f'❌ acceptance-audit failed: {len(bad)} row(s) not done')
    for req,evi,st in bad[:20]:
        print(f'- req={req} status={st or "(empty)"} evidence={evi or "(empty)"}')
    raise SystemExit(1)

print('✅ acceptance-audit passed')
PY
