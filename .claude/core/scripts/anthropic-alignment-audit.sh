#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/Users/aaron/Developer/MGMTV2/.claude/core}"

echo "🔎 Anthropic alignment audit: $ROOT"

# A1: skill markdown should contain frontmatter name+description
total=$(find "$ROOT/skills" -type f -name "*.md" | wc -l | tr -d ' ')
missing=$(python3 - "$ROOT" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1])/'skills'
miss=[]
for p in root.rglob('*.md'):
    t=p.read_text(errors='ignore')
    if not t.startswith('---'):
        miss.append(str(p)); continue
    m=re.match(r'^---\n(.*?)\n---\n',t,re.S)
    if not m:
        miss.append(str(p)); continue
    fm=m.group(1)
    if 'name:' not in fm or 'description:' not in fm:
        miss.append(str(p))
print('\n'.join(miss))
PY
)
if [ -n "$missing" ]; then
  echo "❌ Frontmatter missing name/description:"; echo "$missing"
else
  echo "✅ Frontmatter check passed ($total files)"
fi

# B1: routing/token guard presence in core entry
if rg -q "绝不全量加载|单次 ≤30KB|先读 INDEX|用完.*释放" "$ROOT/SKILL.md"; then
  echo "✅ Progressive loading constraints present in SKILL.md"
else
  echo "❌ Missing progressive loading constraints in SKILL.md"
fi

# C1: truth-source indexes exist
[ -f "$ROOT/rules/INDEX.md" ] && echo "✅ rules/INDEX.md exists" || echo "❌ rules/INDEX.md missing"
[ -f "$ROOT/workflows/INDEX.md" ] && echo "✅ workflows/INDEX.md exists" || echo "❌ workflows/INDEX.md missing"

# F1: anti-loop + safe exec exists
rg -q "同策略.*2 次|LOOP_BREAK" "$ROOT/rules/common.md" && echo "✅ anti-loop rule exists" || echo "❌ anti-loop rule missing"
[ -x "$ROOT/scripts/safe-exec.sh" ] && echo "✅ safe-exec present" || echo "❌ safe-exec missing"

echo "✅ Anthropics alignment audit done"
