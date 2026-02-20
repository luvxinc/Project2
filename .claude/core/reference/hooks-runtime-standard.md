# Hooks Runtime Standard (ECC-aligned)

## Hooks
- PreToolUse: `core/scripts/hook-pretool.sh`
- PostToolUse: `core/scripts/hook-posttool.sh`
- Stop: `core/scripts/hook-stop.sh`

## Required behavior
1. PreToolUse blocks high-risk/unapproved commands.
2. PostToolUse runs lightweight hygiene audits.
3. Stop enforces final lifecycle constraints.

## CLI examples
```bash
core/scripts/hook-pretool.sh "git push"
core/scripts/hook-posttool.sh /Users/aaron/Developer/MGMTV2
core/scripts/hook-stop.sh /Users/aaron/Developer/MGMTV2
```
