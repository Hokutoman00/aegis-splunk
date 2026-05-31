#!/usr/bin/env bash
# demo/run-demo.sh — single-command orchestrator for the 3-minute demo.
#
# Brings up the aegis-splunk server, launches the chaos cascade, runs the
# SOC agent client, then tears everything down. Reproducible: re-run between
# takes until the video is clean. Each stage logs to demo/.logs/ with a
# timestamped filename so a failed take can be diffed against a good one.
#
# Prereqs:
#   - bun >= 1.3
#   - SPLUNK_HEC_URL + SPLUNK_HEC_TOKEN exported (HEC is optional; without
#     it the chaos events go to stdout only and the dashboard panel stays empty)
#   - SPLUNK_SESSION_TOKEN exported if you want the REST shim to hit a real
#     Splunk; otherwise the MCP fallback path returns a synthetic shape
#
# Usage:
#   bash demo/run-demo.sh

set -u
cd "$(dirname "$0")/.."

LOG_DIR="demo/.logs"
mkdir -p "$LOG_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SERVER_LOG="$LOG_DIR/server-$STAMP.log"
CHAOS_LOG="$LOG_DIR/chaos-$STAMP.log"
AGENT_LOG="$LOG_DIR/agent-$STAMP.log"

hr() { printf '\n\033[1;36m== %s ==============================\033[0m\n' "$1"; }

cleanup() {
  hr "cleanup"
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[run-demo] stopping aegis server pid=$SERVER_PID"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${CHAOS_PID:-}" ] && kill -0 "$CHAOS_PID" 2>/dev/null; then
    echo "[run-demo] stopping chaos script pid=$CHAOS_PID"
    kill "$CHAOS_PID" 2>/dev/null || true
    wait "$CHAOS_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

hr "stage 1 — start aegis-splunk server (background)"
bun run src/server/index.ts > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "[run-demo] aegis server pid=$SERVER_PID log=$SERVER_LOG"

# Wait for /health to respond (max 10s).
for i in $(seq 1 20); do
  if curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/health 2>/dev/null | grep -q 200; then
    echo "[run-demo] server healthy after ${i}*500ms"
    break
  fi
  sleep 0.5
done
if ! curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/health 2>/dev/null | grep -q 200; then
  echo "[run-demo] server did not become healthy in 10s — see $SERVER_LOG"
  exit 1
fi

hr "stage 2 — launch chaos cascade (background, scenario=soc-p1)"
bun run demo/chaos-script.ts --scenario soc-p1 > "$CHAOS_LOG" 2>&1 &
CHAOS_PID=$!
echo "[run-demo] chaos pid=$CHAOS_PID log=$CHAOS_LOG"

# Let the analyst+agent start about 5s after the chaos script so the first
# investigation MCP call lands BEFORE the T+20s anthropic_429 injection.
sleep 5

hr "stage 3 — run SOC agent client (foreground, streams to stdout)"
AEGIS_BASE="http://localhost:3000" bun run demo/agent-client.ts 2>&1 | tee "$AGENT_LOG"

hr "stage 4 — wait for chaos cascade to finish"
wait "$CHAOS_PID" 2>/dev/null || true
CHAOS_RC=$?
echo "[run-demo] chaos exit code: $CHAOS_RC"

hr "stage 5 — done"
echo "[run-demo] logs:"
echo "  server: $SERVER_LOG"
echo "  chaos:  $CHAOS_LOG"
echo "  agent:  $AGENT_LOG"
echo "[run-demo] watch the Splunk dashboard: sourcetype IN (aegis:chaos, aegis:mcp-failover) earliest=-5m"
