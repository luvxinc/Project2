#!/usr/bin/env bash
set -euo pipefail

# safe-exec.sh: timeout + no-output watchdog + bounded retries
# Usage:
#   safe-exec.sh --timeout 90 --idle-timeout 45 --retries 1 -- <command ...>

TIMEOUT_SEC=90
IDLE_TIMEOUT_SEC=45
RETRIES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT_SEC="$2"; shift 2 ;;
    --idle-timeout) IDLE_TIMEOUT_SEC="$2"; shift 2 ;;
    --retries) RETRIES="$2"; shift 2 ;;
    --) shift; break ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 [--timeout N] [--idle-timeout N] [--retries N] -- <command...>"
  exit 2
fi

attempt=0
while true; do
  attempt=$((attempt+1))
  echo "▶ safe-exec attempt $attempt/$((RETRIES+1)): $*"

  # python watchdog: kills child on total timeout or idle timeout
  python3 - "$TIMEOUT_SEC" "$IDLE_TIMEOUT_SEC" "$@" <<'PY'
import os,sys,subprocess,time,selectors

total=int(sys.argv[1]); idle=int(sys.argv[2]); cmd=sys.argv[3:]
start=time.time(); last=time.time()
p=subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
sel=selectors.DefaultSelector(); sel.register(p.stdout, selectors.EVENT_READ)

while True:
    if p.poll() is not None:
        break
    now=time.time()
    if now-start>total:
        print(f"⏱ total-timeout>{total}s, killing...")
        p.kill(); p.wait(); sys.exit(124)
    events=sel.select(timeout=1)
    if events:
        for key,_ in events:
            line=key.fileobj.readline()
            if line:
                print(line, end='')
                last=time.time()
    elif now-last>idle:
        print(f"⏳ idle-timeout>{idle}s, killing...")
        p.kill(); p.wait(); sys.exit(125)

# drain rest
for line in p.stdout:
    print(line, end='')
sys.exit(p.returncode)
PY
  rc=$?
  if [[ $rc -eq 0 ]]; then
    exit 0
  fi

  if [[ $attempt -gt $RETRIES ]]; then
    echo "❌ safe-exec failed after $attempt attempt(s), rc=$rc"
    exit $rc
  fi

  echo "↻ retry with backoff..."
  sleep $((attempt*2))
done
