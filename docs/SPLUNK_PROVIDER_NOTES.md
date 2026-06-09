# Splunk Hosted Models — Provider Notes (Phase 1)

## Assumption (needs live verification)
The Splunk AI Assistant exposes its hosted models over an OpenAI-compatible chat-completions surface at:

```
https://<splunk-host>:8089/services/ai/<model-id>/v1
```

…on the Splunk management port (8089) using REST bearer auth. This shape is inferred from the Splunk REST API conventions and the Splunk AI Assistant Splunkbase listing; it has not yet been hit live. The `SPLUNK_HOSTED_MODELS_BASE` env var lets us reshape the URL once the real endpoint is confirmed without touching code.

## Target version
Splunk MCP Server, Splunkbase app id **#7931**, latest release as of 2026-05. Foundation AI Security model is the most agent-relevant of the three (gpt-oss-120b / gpt-oss-20b / foundation-ai-security) because of its SOC-tuned safety alignment.

## TODO once SPLUNK_SESSION_TOKEN is provisioned
- [ ] Hit `/services/auth/login` and capture a real session token.
- [ ] `curl` one of the model endpoints to confirm the path shape and whether `/v1` suffix is required per model.
- [ ] Decide whether to keep the OpenAI SDK or switch to direct `fetch` if the response envelope diverges.
- [x] Wire the provider into `l0-hedge.ts` (Phase 2).
- [ ] Add Splunk-side rate-limit + error-class mapping to L4 semantic normalizer.

---

## Phase 2 changes (2026-05-31)

### Files
- `src/aegis/types.ts` — `ProviderTry.via` union extended with `'splunk'`.
- `src/aegis/l0-hedge.ts` — `HedgeConfig.hedgeVia?: 'tf' | 'splunk'` added; hedge attempt branches on it; resulting `ProviderTry.via` is tagged accordingly. TF-only path semantics unchanged when `hedgeVia` is unset.
- `src/aegis/splunk-audit.ts` (new) — HEC emitter with `aegis:chaos` / `aegis:mcp-failover` sourcetypes, abortable timeout, errors swallowed, fire-and-forget helper `emitHECEventNoWait`.
- `src/mcp/splunk-proxy.ts` (new) — forwards MCP tool calls to `SPLUNK_MCP_URL`; on timeout / HTTP 5xx / malformed JSON / network error, falls back to REST shim (`splunk_search` → `/services/search/jobs?exec_mode=oneshot`). Emits structured audit event (request_id, tool_name, primary_outcome, fallback_used, latency_ms, error_class) to console + HEC.
- `src/config.ts` — added `SPLUNK_MCP_URL` (default `http://localhost:8089/services/mcp`).
- `.env.example` — `SPLUNK_MCP_URL` documented.
- Tests: `tests/unit/splunk-hedge.test.ts`, `src/mcp/splunk-proxy.test.ts`, `src/aegis/splunk-audit.test.ts`, and the later Foundation AI Security + Trust Layer coverage keep the current suite at 111 pass / 0 fail.

### Demo path enabled (Scene 3 from the Splunk demo plan)
1. Anthropic returns 429 via TF → L0 hedge fires with `hedgeVia: 'splunk'` and `hedgeModel: 'gpt-oss-120b'`.
2. `getSplunkClient()` answers from the Splunk hosted-models surface; receipt records `ProviderTry { via: 'splunk', name: 'gpt-oss-120b' }`.
3. The agent then issues `splunk_search` via `forwardMCPCall()`. Splunk MCP Server returns 503.
4. `splunk-proxy` detects `http_5xx`, dispatches the REST shim to `/services/search/jobs?exec_mode=oneshot`, returns results; `MCPProxyResponse { primary_outcome: 'http_5xx', fallback_used: true, ok: true }`.
5. Both events ship to HEC (`aegis:mcp-failover`) so the SOC analyst sees the failover in real time on a Splunk dashboard.

## TODO for Phase 3+
- [ ] Chaos engine (`src/aegis/l6-chaos.ts`) emits `aegis:chaos` HEC events via `splunk-audit.emitHECEventNoWait` so chaos drill results land in the same index as live failovers.
- [ ] Extend `splunk-proxy` REST shim beyond `splunk_search`: `splunk_indexes`, `splunk_saved_searches`, `splunk_users`, `splunk_kvstore_lookup`, `splunk_alert_actions` (TODO list also inlined at top of `src/mcp/splunk-proxy.ts`).
- [ ] L4 semantic normalizer: map Splunk error envelopes (e.g. `messages[].type='ERROR'`, REST 401 / 403 / 503 + `messages[].text` patterns) into the existing `message_class` taxonomy.
- [ ] Real Splunk Cloud verification: confirm the `/services/ai/<model>/v1` path shape live, verify HEC accepts our `event` payload as-is, and capture latency baselines so the Phase 2 default hedge threshold can be tuned to true Splunk p95.
- [ ] Replace `exec_mode=oneshot` in the REST shim with proper job submit + poll once latency / row-count limits of `oneshot` are characterized against the dashboard query mix.

### Unresolved assumptions (still need live Splunk to verify)
- Splunk MCP Server endpoint actually accepts `POST { tool_name, args }` at `/services/mcp`. Shape is inferred from the Splunkbase listing; the upstream may use a JSON-RPC framing (in which case the `callPrimary` body builder needs adjusting) — wire-format mismatch shows up as `malformed_json` and gets caught by the fallback, but the error_class would be misleading.
- The REST shim assumes `SPLUNK_HOSTED_MODELS_BASE` shares a host with the standard REST API (i.e. stripping `/services/ai` yields a usable base). True on Splunk Enterprise; needs confirming on Splunk Cloud where management vs. search-head ports sometimes differ.

---

## Phase 3 changes (2026-05-31) — demo scenario package

Phase 3 adds the 3-minute video harness. No Phase 1+2 file was modified; this is orchestration glue around the existing runtime.

### Files
- `demo/SCENARIO.md` — scene-by-scene screenplay (7 beats, T+0:00 → T+2:55), TTS-ready narrator copy, exact on-screen overlay strings, capture checklist.
- `demo/chaos-script.ts` — Bun script that plays the SOC-P1 outage cascade deterministically (sleep 20s → anthropic 429, sleep 30s → splunk MCP 503, sleep 30s → restore, sleep 10s → exit). Each step flips a `CHAOS_*` env var AND emits a structured HEC event so the dashboard reflects the script. CLI: `bun run demo/chaos-script.ts --scenario soc-p1`. Exit 0 on success, 3 if HEC was configured but unreachable (scenario still completes).
- `demo/seed-data/splunk-failed-logins.csv` — 50 synthetic events over 5 minutes, 3 source IPs (`198.51.100.23`, `203.0.113.47`, `192.0.2.88`) hammering `admin_socops`, mostly `401`/`403`, ending with one `200` from `203.0.113.47` (the line the agent should flag). Columns `_time, host, source, sourcetype, srcIP, user, action, status_code`. Ingest via HEC `/raw?sourcetype=linux_secure`.
- `demo/agent-client.ts` — minimal SOC agent using OpenAI SDK pointed at aegis-splunk's `/v1` + the MCP proxy at `/v1/mcp/call`. One question (failed-login spike + credential-stuffing assessment). Streams response to stdout for natural video capture.
- `demo/run-demo.sh` — single-command orchestrator: start server in background → wait for `/health` → fire chaos cascade in background → run agent client in foreground → wait → teardown. Reproducible between takes; per-stage logs land in `demo/.logs/`.
- `demo/README.md` — operator instructions: prereqs (Splunk Enterprise local, HEC enabled, `SPLUNK_SESSION_TOKEN` set), one-time seed-data ingest, 4-panel dashboard layout, recording setup, troubleshooting.

### How each file contributes to the judging criteria

**Technological Implementation (25%)** — `chaos-script.ts` and `agent-client.ts` exercise the Phase 1+2 surface end-to-end: `hedgeVia: 'splunk'` routes through `getSplunkClient()` on the Anthropic 429, and `forwardMCPCall()` engages the REST-shim fallback on the Splunk MCP 503. Both paths are observable in the same Splunk index via the HEC sourcetypes added in Phase 2. `run-demo.sh` makes the full cascade reproducible in a single command, which is what a judge replaying the README will actually run.

**Potential Impact (25%)** — `SCENARIO.md` frames the value proposition the way a Splunk customer would experience it: the SOC analyst in a live P1 keeps working because both the model layer and the tool layer have transparent fallbacks, AND the recovery is visible on the same dashboard they were already watching. The 4-panel dashboard layout in `demo/README.md` shows that aegis-splunk's chaos verification IS the Splunk observability artifact, not a separate side-channel — there is no second tool for the SOC team to learn.

### TODO before recording
- [ ] Provision `SPLUNK_SESSION_TOKEN` on a live Splunk Cloud trial so the REST shim hits real `/services/search/jobs` instead of returning the synthetic shape; the visual difference in the receipt JSON (real Splunk result envelope vs. error stub) is what sells the failover path on camera.
- [ ] Build the 4-panel dashboard in the live Splunk UI and save as `aegis-splunk-demo`; export the dashboard XML into `demo/seed-data/` so the next operator doesn't have to click through Settings.
- [ ] Confirm the Splunk MCP Server (Splunkbase #7931) wire format — see Phase 2 unresolved assumption above. If the upstream uses JSON-RPC, adjust `callPrimary()` in `src/mcp/splunk-proxy.ts` so the primary outcome is `success` when MCP is up, not `malformed_json` masquerading as a fallback.
