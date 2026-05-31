#!/usr/bin/env bash
# demo/run-demo-dryrun.sh - synthetic dry-run variant of run-demo.sh.
#
# Runs the full demo orchestrator with dummy env vars so a fresh clone with
# no .env.local and no Splunk Cloud trial can still exercise every code
# path. Server boots, chaos cascade fires, agent client streams (degraded
# graceful response from L5), HEC emit is no-op (returns attempted:false),
# MCP proxy uses mock callers.
#
# This is the fallback video path when Plan A (live Splunk recording) is
# not available. See demo/video/SYNTHETIC_FALLBACK.md for the recording
# script.
#
# Differences from run-demo.sh:
#   - Sets dummy TRUEFOUNDRY_* env vars inline (server boot needs them per
#     src/config.ts Zod schema; otherwise process exits with code 1)
#   - Does NOT export SPLUNK_HEC_TOKEN or SPLUNK_SESSION_TOKEN, so HEC
#     emit returns { attempted: false } and the MCP proxy uses the mock
#     caller default. This is the honest "synthetic Splunk responses" mode.
#   - Banner overlay marker emitted at startup so the video editor knows
#     where to drop the "synthetic" overlay text.
#
# Usage:
#   bash demo/run-demo-dryrun.sh

set -u
cd "$(dirname "$0")/.."

LOG_DIR="demo/.logs"
mkdir -p "$LOG_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SERVER_LOG="$LOG_DIR/server-dryrun-$STAMP.log"
CHAOS_LOG="$LOG_DIR/chaos-dryrun-$STAMP.log"
AGENT_LOG="$LOG_DIR/agent-dryrun-$STAMP.log"

hr() { printf '\n\033[1;36m== %s ==============================\033[0m\n' "$1"; }
banner() { printf '\n\033[1;33m### SYNTHETIC DRY-RUN: %s ###\033[0m\n' "$1"; }

banner "no live Splunk Cloud, no live TrueFoundry - all responses synthetic"
banner "see ARCHITECTURE.md for the live-integration path"

# Minimum-viable env to pass the Zod schema in src/config.ts. These are
# obviously-fake placeholders; do NOT use them against a real TF tenant.
export TRUEFOUNDRY_API_KEY="dryrun-placeholder-not-a-real-token-12345678"
export TRUEFOUNDRY_OPENAI_BASE="https://dryrun.local.invalid/api/llm/api/inference/openai"
export TRUEFOUNDRY_VIRTUAL_MODEL="aegis-resilient/claude-with-fallback"
export PORT=3000
export NODE_ENV=development

# Explicitly leave SPLUNK_SESSION_TOKEN + SPLUNK_HEC_TOKEN empty so the
# HEC emitter returns { attempted: false } and the MCP proxy uses mock
# callers. This is the demonstration mode.
unset SPLUNK_SESSION_TOKEN || true
unset SPLUNK_HEC_TOKEN || true

cleanup() {
  hr "cleanup"
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[run-demo-dryrun] stopping aegis server pid=$SERVER_PID"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${CHAOS_PID:-}" ] && kill -0 "$CHAOS_PID" 2>/dev/null; then
    echo "[run-demo-dryrun] stopping chaos script pid=$CHAOS_PID"
    kill "$CHAOS_PID" 2>/dev/null || true
    wait "$CHAOS_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

hr "stage 1 - start aegis-splunk server (background, DRYRUN env)"
bun run src/server/index.ts > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "[run-demo-dryrun] aegis server pid=$SERVER_PID log=$SERVER_LOG"

for i in $(seq 1 20); do
  if curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/health 2>/dev/null | grep -q 200; then
    echo "[run-demo-dryrun] server healthy after ${i}*500ms"
    break
  fi
  sleep 0.5
done
if ! curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/health 2>/dev/null | grep -q 200; then
  echo "[run-demo-dryrun] server did not become healthy in 10s - see $SERVER_LOG"
  exit 1
fi

hr "stage 2 - launch chaos cascade (background, scenario=soc-p1, synthetic)"
bun run demo/chaos-script.ts --scenario soc-p1 > "$CHAOS_LOG" 2>&1 &
CHAOS_PID=$!
echo "[run-demo-dryrun] chaos pid=$CHAOS_PID log=$CHAOS_LOG"

sleep 5

hr "stage 3 - run SOC agent client (foreground, synthetic responses)"
AEGIS_BASE="http://localhost:3000" bun run demo/agent-client.ts 2>&1 | tee "$AGENT_LOG"

hr "stage 4 - wait for chaos cascade to finish"
wait "$CHAOS_PID" 2>/dev/null || true
CHAOS_RC=$?
echo "[run-demo-dryrun] chaos exit code: $CHAOS_RC"

hr "stage 5 - done (synthetic mode)"
banner "all responses above are synthetic - see demo/video/SYNTHETIC_FALLBACK.md"
echo "[run-demo-dryrun] logs:"
echo "  server: $SERVER_LOG"
echo "  chaos:  $CHAOS_LOG"
echo "  agent:  $AGENT_LOG"
echo "[run-demo-dryrun] to switch to live mode: provision Splunk Cloud trial,"
echo "                  cp .env.example .env.local, fill SPLUNK_*, run demo/run-demo.sh"
