# demo/ — 3-minute video assets

This directory holds everything needed to record the submission video for the Splunk Agentic Ops Hackathon. The Phase 1+2 runtime (`src/aegis/`, `src/mcp/`) is left untouched; everything here is orchestration glue.

## What's in here

| File | Role |
|---|---|
| `SCENARIO.md` | Scene-by-scene screenplay. 7 beats, narrator TTS copy, on-screen overlays. |
| `chaos-script.ts` | Deterministic outage cascade. Drives the script in lockstep with `SCENARIO.md` timings and emits HEC events so the Splunk dashboard moves in real time. |
| `seed-data/splunk-failed-logins.csv` | 50-event synthetic spike — 3 source IPs hammering one user `admin_socops`, ending with one suspicious successful login. Ingest into Splunk before recording. |
| `agent-client.ts` | Minimal SOC agent that talks to aegis-splunk as its LLM gateway + MCP proxy, streams reasoning to stdout. |
| `run-demo.sh` | Single-command orchestrator. Start server, fire chaos, run agent, tear down. Reproducible between takes. |

## Prereqs

1. **Splunk Enterprise (local) or Splunk Cloud trial** with HEC enabled.
   - Settings → Data Inputs → HTTP Event Collector → enable, create a token, allow indexing into `main`.
2. **Environment** — copy `.env.example` → `.env.local` and set at minimum:
   ```
   SPLUNK_HEC_URL=https://<splunk-host>:8088/services/collector
   SPLUNK_HEC_TOKEN=<hec-token>
   SPLUNK_SESSION_TOKEN=<session-token-from-/services/auth/login>
   TRUEFOUNDRY_API_KEY=<tf-key>
   TRUEFOUNDRY_OPENAI_BASE=<tf-openai-base-url>
   ```
   Without `SPLUNK_HEC_TOKEN` the chaos events still print to stdout but the dashboard panels stay empty. Without `SPLUNK_SESSION_TOKEN` the REST-shim fallback returns a synthetic response shape (good enough for the video; live Splunk improves authenticity).
3. **bun** ≥ 1.3.

## Pre-recording one-time setup

```bash
# 1. ingest the failed-login seed data (one-shot, replace HEC vars first)
curl -k "$SPLUNK_HEC_URL/raw?sourcetype=linux_secure&index=main" \
  -H "Authorization: Splunk $SPLUNK_HEC_TOKEN" \
  --data-binary @demo/seed-data/splunk-failed-logins.csv

# 2. import the dashboard (build manually — 4 panels recommended):
#    - Panel A: failed-login count over time (sourcetype=linux_secure user=admin_socops status_code=401)
#    - Panel B: aegis:chaos events (sourcetype=aegis:chaos | table _time, event, toxic, target)
#    - Panel C: aegis:mcp-failover events (sourcetype=aegis:mcp-failover | table _time, tool_name, primary_outcome, fallback_used, latency_ms)
#    - Panel D: recovery latency single-value (sourcetype=aegis:mcp-failover fallback_used=true | stats avg(latency_ms))
```

## Run the demo

Single command:

```bash
bash demo/run-demo.sh
```

What happens:

1. `bun run src/server/index.ts` boots aegis-splunk on `:3000` in the background.
2. `/health` is polled until it returns 200 (max 10s).
3. `demo/chaos-script.ts --scenario soc-p1` launches in the background. Timeline:
   - T+0s: cascade_start HEC event.
   - T+20s: `CHAOS_PRIMARY_DOWN=anthropic` set + HEC event.
   - T+50s: `CHAOS_MCP_ERROR_RATE=1.0` set + HEC event.
   - T+80s: restore.
   - T+90s: cascade_end.
4. After a 5-second offset, `demo/agent-client.ts` runs in the foreground, calls `splunk_search` via the MCP proxy, then streams the model's analysis to stdout.
5. Cascade finishes, server is torn down. Logs land in `demo/.logs/`.

## Recording

- OBS or any capture tool. Source A = terminal running `run-demo.sh`. Source B = browser on the Splunk dashboard.
- Layout per `SCENARIO.md`: agent chat left 60%, dashboard right 40%.
- Narration is dubbed in post using `.claude/video/scripts/tts-to-file.mjs` against the lines in `SCENARIO.md`. msedge-tts (`en-US-AriaNeural`) is the canonical voice.
- Re-run `run-demo.sh` between takes — every step is deterministic so cut points are repeatable.

## What you'll see on the dashboard

- **Panel A** climbs as the seed data hits during T+0..20s.
- **Panel B** (`aegis:chaos`) gets `chaos_inject anthropic_429` at T+20, `chaos_restore` at T+80.
- **Panel C** (`aegis:mcp-failover`) gets `tool_name=splunk_search primary_outcome=http_5xx fallback_used=true` rows during T+50..80.
- **Panel D** shows recovery latency < 2s once the failover row arrives.

## Troubleshooting

- **Splunk dashboard stays empty**: HEC token/URL wrong, or HEC not enabled on the Splunk side. `chaos-script.ts` will exit with code 3 if HEC was configured but unreachable.
- **Agent streams nothing**: server didn't come up. Check `demo/.logs/server-*.log`.
- **MCP call always uses REST shim even before T+50s**: `SPLUNK_MCP_URL` points somewhere unreachable — primary fails fast and fallback engages immediately. Set `SPLUNK_MCP_URL` to a reachable mock or comment-out the chaos inject step to verify.

## What this satisfies (judging criteria mapping)

See `docs/SPLUNK_PROVIDER_NOTES.md` Phase 3 section for the per-file mapping to Technological Implementation (25%) and Potential Impact (25%).
