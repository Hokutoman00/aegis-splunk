# Splunk Dashboard Queries

Use these SPL panels to verify that aegis-splunk turns model and MCP failures
into Splunk-observable recovery events.

## Prerequisites

Set HEC environment variables before running the live demo:

```bash
export SPLUNK_HEC_URL=http://localhost:8088/services/collector
export SPLUNK_HEC_TOKEN=<your-token>
export SPLUNK_SESSION_TOKEN=<your-session-token>
```

Then run:

```bash
bash demo/run-demo.sh
```

If live Splunk is unavailable, use `bash demo/run-demo-dryrun.sh` and the
synthetic path in `demo/video/SYNTHETIC_FALLBACK.md`.

## Panel 1: Recovery event stream

```spl
index=main sourcetype="aegis:*" earliest=-15m
| sort 0 _time
| table _time sourcetype request_id event tool_name primary_outcome fallback_used winner latency_ms error_class
```

Expected signal: both `aegis:chaos` and `aegis:mcp-failover` rows appear during
the SOC-P1 demo cascade.

## Panel 2: MCP failover outcomes

```spl
index=main sourcetype="aegis:mcp-failover" earliest=-15m
| stats count as calls, count(eval(fallback_used=true)) as failovers, avg(latency_ms) as avg_latency_ms by tool_name primary_outcome
| sort -failovers -calls
```

Expected signal: `splunk_search` shows `fallback_used=true` when the primary
Splunk MCP Server returns 5xx, timeout, or malformed JSON.

## Panel 3: Chaos drill survival

```spl
index=main sourcetype="aegis:chaos" earliest=-15m
| stats latest(verdict) as latest_verdict, count as drills by target injected
| sort target injected
```

Expected signal: chaos rows show injected provider or MCP failure classes and
the recovery verdict.

## Panel 4: Recovery latency

```spl
index=main sourcetype="aegis:mcp-failover" fallback_used=true earliest=-15m
| stats avg(latency_ms) as avg_latency_ms, p95(latency_ms) as p95_latency_ms, max(latency_ms) as max_latency_ms
```

Expected signal: failover latency is visible as an operational metric, not a
hidden agent-side implementation detail.

## Panel 5: Hosted-model hedge wins

```spl
index=main sourcetype="aegis:chaos" earliest=-15m
| search winner=* OR hedge_model=* OR provider=*
| table _time request_id target injected winner hedge_model provider verdict
```

Expected signal: when the provider path degrades, the receipt/chaos event can
show Splunk-hosted model recovery such as `gpt-oss-120b` or
`foundation-ai-security`.

## Panel 6: AI Ops trust posture

```spl
index=main sourcetype="aegis:chaos" earliest=-15m
| spath path=trust_posture.level output=trust_level
| spath path=trust_posture.score output=trust_score
| spath path=trust_posture.human_gate output=human_gate
| spath path=trust_posture.operator_next_action output=operator_next_action
| where isnotnull(trust_level)
| table _time trust_level trust_score human_gate operator_next_action
| sort - _time
```

Expected signal: after a drill, the dashboard does not only show that recovery
happened; it shows whether the human should continue, watch, approve degraded
mode, or stop and review.

## Dashboard layout

Recommended video layout:

| Area | Panel |
|---|---|
| Top left | Recovery event stream |
| Top right | MCP failover outcomes |
| Bottom left | Chaos drill survival |
| Bottom right | AI Ops trust posture |

This makes the key claim visible: the chaos-verification trace is the Splunk
observability artifact.
