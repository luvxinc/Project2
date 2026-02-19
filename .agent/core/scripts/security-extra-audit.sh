#!/usr/bin/env bash
set -euo pipefail

# Extra security/compliance audit (best-effort by default)
# Usage: security-extra-audit.sh <repo-root> [mode=warn|enforce]

ROOT="${1:-.}"
MODE="${2:-warn}"
cd "$ROOT"

fail_count=0
note_fail(){ echo "❌ $1"; fail_count=$((fail_count+1)); }
note_warn(){ echo "⚠️  $1"; }
note_ok(){ echo "✅ $1"; }

# 1) SAST
if command -v semgrep >/dev/null 2>&1; then
  SEMGREP_SCOPE="${SEMGREP_SCOPE:-full}" # full|diff
  SEMGREP_ENFORCE_PROFILE="${SEMGREP_ENFORCE_PROFILE:-critical}" # critical|all
  ENFORCE_RULES_FILE=".agent/core/reference/semgrep-enforce-rules.txt"
  semgrep_out="/tmp/semgrep-audit.json"

  run_semgrep() {
    if [ "$SEMGREP_SCOPE" = "diff" ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      base_ref="${SEMGREP_BASE_REF:-HEAD~1}"
      files=$(git diff --name-only "$base_ref"...HEAD | while read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done | tr '\n' ' ')
      if [ -z "$files" ]; then
        note_warn "Semgrep(diff) skipped: no changed files"
        return 0
      fi
      # shellcheck disable=SC2086
      semgrep --config auto --json $files > "$semgrep_out" || true
      echo "Semgrep(diff) report: $semgrep_out"
    else
      semgrep --config auto --json . > "$semgrep_out" || true
      echo "Semgrep(full) report: $semgrep_out"
    fi

    if [ "$MODE" = "enforce" ] && [ "$SEMGREP_ENFORCE_PROFILE" = "critical" ] && [ -f "$ENFORCE_RULES_FILE" ]; then
      if python3 - "$semgrep_out" "$ENFORCE_RULES_FILE" <<'PY'
import json,sys
rep=json.load(open(sys.argv[1]))
rules={x.strip() for x in open(sys.argv[2]) if x.strip() and not x.strip().startswith('#')}
hits=[r for r in rep.get('results',[]) if r.get('check_id') in rules]
print(f"critical_hits={len(hits)}")
for h in hits[:20]:
    p=h.get('path'); ln=h.get('start',{}).get('line'); cid=h.get('check_id')
    print(f"- {cid} @ {p}:{ln}")
raise SystemExit(1 if hits else 0)
PY
      then
        note_ok "Semgrep(critical)"
      else
        note_fail "Semgrep(critical)"
      fi
    else
      # non-enforce or enforce-all fallback
      if python3 - "$semgrep_out" <<'PY'
import json,sys
rep=json.load(open(sys.argv[1]))
print('findings',len(rep.get('results',[])))
raise SystemExit(0)
PY
      then
        note_ok "Semgrep"
      else
        note_fail "Semgrep"
      fi
    fi
  }

  run_semgrep
elif command -v codeql >/dev/null 2>&1; then
  note_warn "CodeQL CLI detected; integrate project-specific run manually"
else
  note_warn "SAST skipped: semgrep/codeql not installed"
fi

# 2) Secret scan
if command -v gitleaks >/dev/null 2>&1; then
  GITLEAKS_CFG=".gitleaks.toml"
  if [ -f "$GITLEAKS_CFG" ]; then
    if gitleaks dir . --no-banner --config "$GITLEAKS_CFG"; then note_ok "gitleaks(dir,config)"; else note_fail "gitleaks(dir,config)"; fi
  else
    if gitleaks dir . --no-banner; then note_ok "gitleaks(dir)"; else note_fail "gitleaks(dir)"; fi
  fi
else
  note_warn "Secret scan skipped: gitleaks not installed"
fi

# 3) SBOM + license
if command -v syft >/dev/null 2>&1; then
  syft dir:. -o cyclonedx-json > /tmp/sbom.json && note_ok "SBOM generated (/tmp/sbom.json)" || note_fail "SBOM generation"
else
  note_warn "SBOM skipped: syft not installed"
fi

if command -v licensee >/dev/null 2>&1; then
  if licensee detect .; then note_ok "licensee"; else note_fail "licensee"; fi
elif command -v license-eye >/dev/null 2>&1; then
  if license-eye dependency check -w; then note_ok "license-eye"; else note_fail "license-eye"; fi
else
  note_warn "License check skipped: licensee/license-eye not installed"
fi

if [ "$MODE" = "enforce" ] && [ $fail_count -gt 0 ]; then
  echo "❌ security-extra-audit failed ($fail_count)"
  exit 1
fi

echo "✅ security-extra-audit done (mode=$MODE, fails=$fail_count)"
