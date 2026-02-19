#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/aaron/Developer/MGMTV2/.agent/warehouse/tools"

python3 - <<PY
from pathlib import Path
import hashlib,re,sys
root=Path('$ROOT')
seen={}
collisions=[]
for p in root.glob('*/*.md'):
    if p.name=='INDEX.md':
        continue
    t=p.read_text(errors='ignore')
    # normalize: drop provenance lines
    t='\n'.join([ln for ln in t.splitlines() if not ln.startswith('> source_') and not ln.startswith('> extracted_')])
    t=re.sub(r'\s+',' ',t).strip().lower()
    h=hashlib.sha1(t.encode()).hexdigest()
    if h in seen:
        collisions.append((str(p),seen[h]))
    else:
        seen[h]=str(p)

if collisions:
    print('⚠️ potential duplicate slices:')
    for a,b in collisions[:50]:
        print('-',a,'==',b)
    sys.exit(1)
print('✅ dedupe audit passed')
PY
