#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.agent}"
BASE="$(cd "$(dirname "$ROOT")" && pwd)/$(basename "$ROOT")"

echo "🔎 Agent doc audit: $BASE"

# 1) legacy path check
legacy=$(rg -n "projects/\{project\}/" "$BASE/core" | rg -v "\.claude/projects/\{project\}/" || true)
if [ -n "$legacy" ]; then
  echo "\n❌ Legacy path found (should use .claude/projects/{project}/):"
  echo "$legacy"
else
  echo "✅ Path check passed"
fi

# 2) V2 wording check in core
v2=$(rg -n "V2\+V3|双栈并行|V2→V3 迁移 🔄 进行中|NestJS" "$BASE/core" || true)
if [ -n "$v2" ]; then
  echo "\n⚠️  V2 wording found in core (review needed):"
  echo "$v2"
else
  echo "✅ V2 wording check passed"
fi

# 3) duplicate-heavy block heuristic
for f in "$BASE/core/skills/project-manager.md" "$BASE/core/skills/chief-engineer.md" "$BASE/core/skills/qa-auditor.md"; do
  [ -f "$f" ] || continue
  c=$(rg -n "编译通过|类型检查|交付门禁|Approve|Warning|Block" "$f" | wc -l | tr -d ' ')
  echo "📄 $(basename "$f"): keyword_hits=$c"
done

# 4) markdown reference integrity (hard vs template placeholders)
python3 - "$BASE" <<'PY'
from pathlib import Path
import re
import sys

base=Path(sys.argv[1])
repo=base.parent
core=base/'core'
pat=re.compile(r'`([^`]+\.md)`')
soft_names={
  'ACCEPTED.md','requirements-list.md','user-feedback.md','risk-register.md','engineering-status.md',
  '_INDEX.md','CHANGELOG.md','auth.md','products.md','vma.md','TRACKER-VMA-PHONE-001.md',
  '2026-02-15_vma-employee-phone-field.md','2026-02-15_vma-employee-phone-field_plan.md',
  '2026-02-15_vma-employee-phone-field_checkpoint.md','2026-02-15_vma-employee-phone-field_audit.md',
  '2026-02-15_prisma-migration-gotchas.md','api-field-mapping.md','legacy-mysql-schema.md','2026-02-15_vma-phone.md','PROJECT-MEMORY.md','PROJECT-MEMORY-uiux.md','PROJECT-MEMORY-data.md','PROJECT-MEMORY-rules.md'
}
hard=[]; soft=[]
for p in core.rglob('*.md'):
  txt=p.read_text(errors='ignore')
  for ref in pat.findall(txt):
    if ref.startswith('http') or '*' in ref or '{' in ref:
      continue
    rp=Path(ref)
    cands=[(p.parent/rp).resolve(),(base/rp).resolve(),(core/rp).resolve(),(repo/rp).resolve()]
    if any(c.exists() for c in cands):
      continue
    item=f"{p.relative_to(repo)} :: {ref}"
    if rp.name in soft_names:
      soft.append(item)
    else:
      hard.append(item)

if hard:
  print(f"\n❌ Hard missing references: {len(hard)}")
  for x in hard[:50]:
    print(x)
else:
  print("\n✅ Hard reference check passed")

print(f"⚪ Soft placeholders: {len(soft)}")
PY

echo "\n✅ Audit done"
