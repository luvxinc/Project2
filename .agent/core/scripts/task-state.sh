#!/usr/bin/env bash
set -euo pipefail

# Task State Machine v1
# Usage:
#   task-state.sh init <project-root> <task-id>
#   task-state.sh set <project-root> <task-id> <STATE> [note]
#   task-state.sh get <project-root> <task-id>
#   task-state.sh recover <project-root> <task-id>
# States: INIT RUNNING BLOCKED VERIFY CLOSED

MODE="${1:-}"
PROOT="${2:-}"
TASK_ID="${3:-}"
STATE="${4:-}"
NOTE="${5:-}"

[ -n "$MODE" ] || { echo "mode required"; exit 2; }
[ -n "$PROOT" ] || { echo "project-root required"; exit 2; }
[ -n "$TASK_ID" ] || { echo "task-id required"; exit 2; }

STATE_DIR="$PROOT/data/progress/task-states"
CHK_DIR="$PROOT/data/checkpoints"
STATE_FILE="$STATE_DIR/${TASK_ID}.json"
mkdir -p "$STATE_DIR" "$CHK_DIR"

ts(){ date -u +"%Y-%m-%dT%H:%M:%SZ"; }

validate_state(){
  case "$1" in INIT|RUNNING|BLOCKED|VERIFY|CLOSED) ;; *) echo "invalid state: $1"; exit 2;; esac
}

write_state(){
  local st="$1"; local note="$2"
  python3 - "$STATE_FILE" "$TASK_ID" "$st" "$note" <<'PY'
import json,sys,datetime,pathlib
fp=pathlib.Path(sys.argv[1]); tid=sys.argv[2]; st=sys.argv[3]; note=sys.argv[4]
now=datetime.datetime.now(datetime.UTC).replace(microsecond=0).isoformat().replace('+00:00','Z')
obj={"taskId":tid,"state":st,"updatedAt":now,"note":note}
if fp.exists():
    try:
        old=json.loads(fp.read_text())
        hist=old.get("history",[])
    except Exception:
        hist=[]
else:
    hist=[]
hist.append({"state":st,"at":now,"note":note})
obj["history"]=hist
fp.write_text(json.dumps(obj,ensure_ascii=False,indent=2))
print(fp)
PY
}

case "$MODE" in
  init)
    write_state INIT "created"
    echo "✅ task initialized: $TASK_ID"
    ;;
  set)
    [ -n "$STATE" ] || { echo "state required"; exit 2; }
    validate_state "$STATE"
    write_state "$STATE" "$NOTE"
    if [ "$STATE" = "BLOCKED" ] || [ "$STATE" = "VERIFY" ]; then
      cp_file="$CHK_DIR/${TASK_ID}-$(date +%Y%m%d-%H%M%S).md"
      cat > "$cp_file" <<EOF
# Checkpoint: $TASK_ID
- state: $STATE
- at: $(ts)
- note: ${NOTE:-none}
EOF
      echo "🧷 checkpoint: $cp_file"
    fi
    echo "✅ state updated: $TASK_ID -> $STATE"
    ;;
  get)
    [ -f "$STATE_FILE" ] || { echo "not found: $STATE_FILE"; exit 1; }
    cat "$STATE_FILE"
    ;;
  recover)
    [ -f "$STATE_FILE" ] || { echo "not found: $STATE_FILE"; exit 1; }
    last_cp=$(ls -1t "$CHK_DIR"/${TASK_ID}-*.md 2>/dev/null | head -n 1 || true)
    python3 - "$STATE_FILE" "$last_cp" <<'PY'
import json,sys,pathlib
sf=pathlib.Path(sys.argv[1]); cp=sys.argv[2]
obj=json.loads(sf.read_text())
print(json.dumps({
  "taskId": obj.get("taskId"),
  "state": obj.get("state"),
  "updatedAt": obj.get("updatedAt"),
  "latestCheckpoint": cp if cp else None,
  "recoverAction": "resume_from_checkpoint" if cp else "resume_without_checkpoint"
}, ensure_ascii=False, indent=2))
PY
    ;;
  *)
    echo "Usage: $0 init|get|set|recover <project-root> <task-id> [state] [note]"
    exit 2
    ;;
esac
