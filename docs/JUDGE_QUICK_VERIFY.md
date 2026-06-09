# Judge Quick Verify

This page is the short replay path for Splunk Agentic Ops judges. It maps the
submission requirements to concrete files and commands in this repository.

## What to verify first

| Check | Command or file | Expected result |
|---|---|---|
| Tests | `bun test` | `111 pass`, `0 fail`, `347 expect()` |
| TypeScript | `bun x tsc --noEmit` | exit code 0 |
| Architecture diagram | `architecture_diagram.md` | root-level Mermaid diagram renders on GitHub |
| License | `LICENSE` | MIT license |
| Demo path | `demo/run-demo.sh` or `demo/run-demo-dryrun.sh` | starts aegis-splunk, runs the SOC-P1 cascade, tears down |
| Splunk evidence | `docs/SPLUNK_DASHBOARD_QUERIES.md` | SPL panels for `aegis:chaos` and `aegis:mcp-failover` |
| Trust posture | `GET /v1/trust/posture` | human gate and next action derived from Splunk-observable recovery evidence |
| Trust posture replay | `bun run trust:demo` | prints trusted/watch/degraded/halt examples without credentials |

## Why this is Splunk-native

aegis-splunk uses three Splunk surfaces instead of treating Splunk as a logo:

1. **Splunk hosted models**: `gpt-oss-120b`, `gpt-oss-20b`, and
   `foundation-ai-security` are first-class hedge and fallback targets.
2. **Splunk MCP Server**: read tools such as `splunk_search` can fail over to a
   REST shim when the primary MCP server times out or returns 5xx.
3. **Splunk HEC**: every chaos drill and MCP recovery emits an event into the
   same Splunk index a SOC team already watches.
4. **AI Ops Trust Layer**: `src/aegis/trust-posture.ts` converts chaos,
   immunity, and stance-field evidence into a human-in-the-loop posture.

## What is different from a normal incident assistant

Most submissions in this space are assistants that summarize incidents or
perform root-cause analysis. aegis-splunk is the resilience layer underneath
those assistants. It keeps the model path and the tool path alive when upstream
providers or the Splunk MCP Server fail, then records the recovery as Splunk
telemetry.

The visible artifact is not just a chat answer. It is a recovery trace:

```spl
index=main sourcetype="aegis:*" earliest=-15m
| table _time sourcetype request_id event tool_name fallback_used winner latency_ms
```

## Requirement mapping

| Hackathon requirement | Repository artifact |
|---|---|
| Shows AI use | `src/aegis/l0-hedge.ts`, `src/aegis/l4-semantic.ts`, `src/aegis/stances.ts` |
| Uses Splunk AI capabilities | `src/aegis/splunk-client.ts`, `tests/unit/splunk-hedge.test.ts` |
| Uses Splunk data / operations context | `demo/seed-data/splunk-failed-logins.csv`, `demo/SCENARIO.md` |
| Public OSS with instructions | `README.md`, `LICENSE`, `.env.example` |
| Architecture diagram | `architecture_diagram.md` |
| Demo video under 3 minutes | `demo/SCENARIO.md`, `demo/video/SYNTHETIC_FALLBACK.md` |

## Fast local replay

```bash
bun install
bun test
bun x tsc --noEmit
bun test src/aegis/trust-posture.test.ts
bun run trust:demo
bash demo/run-demo-dryrun.sh
```

Use the live path when Splunk credentials are available:

```bash
export SPLUNK_HEC_URL=http://localhost:8088/services/collector
export SPLUNK_HEC_TOKEN=<your-token>
export SPLUNK_SESSION_TOKEN=<your-session-token>
bash demo/run-demo.sh
```

No secrets are required for the dry-run path.
