# aegis-splunk — Resilience layer for Splunk's agentic stack

[![Hackathon](https://img.shields.io/badge/Splunk_Agentic_Ops_Hackathon-2026-orange)](https://splunk.devpost.com/)
[![Track](https://img.shields.io/badge/Track-Platform_%26_Developer_Experience-blue)](https://splunk.devpost.com/details/prizes)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> **Hedge first, fallback second, continuously chaos-verified, trust-rooted in Splunk — for agents that run on top of Splunk.**

## The scenario judges will recognize

A SOC analyst is mid-P1 incident response. Their agentic AI agent — built on Splunk's SAIA, calling MCP tools, reasoning over hosted models — suddenly stops responding. Behind the scenes the LLM provider returned `429` or `400 credit_balance_too_low`, or the Splunk MCP Server timed out. The agent goes dark. No telemetry on which model produced which decision. The analyst loses minutes they don't have.

Most "resilient" AI gateways — LiteLLM, OpenRouter, Portkey, even TrueFoundry's default Virtual Model fallback — **silently fail** on the `400 credit_balance_too_low` case. The HTTP code is in the 4xx range, so the gateway's fallback list (typically `[401, 403, 408, 429, 500, 502, 503]`) doesn't trigger. ([LiteLLM issue #24320](https://github.com/BerriAI/litellm/issues/24320) documents the gap across the industry.)

## What aegis-splunk adds

`aegis-splunk` sits under the agent and above the providers — including Splunk's hosted models — and turns provider/MCP failures into something Splunk can observe and recover from.

- **Hedge across providers**: parallel calls to Anthropic / OpenAI / Gemini / **Splunk-hosted `gpt-oss-120b` / `gpt-oss-20b` / Foundation AI Security**, first usable response wins, late losers canceled.
- **Fallback chain that catches what gateways miss**: an L4 semantic layer reclassifies provider errors like `credit_balance_too_low` as fallback-eligible, so the agent never silently breaks on a non-standard 4xx.
- **MCP failover for Splunk MCP Server**: aegis-splunk proxies the official Splunk MCP Server (Splunkbase #7931). On primary timeout or 5xx it transparently fails over to a thin REST-backed shim that exposes the same tool surface against Splunk's `/services/search/jobs`.
- **Continuous chaos verification, exported to Splunk**: a chaos engine periodically simulates provider and MCP outages **in shadow** and emits a structured audit event per drill. The audit log is ingested into Splunk via HEC (sourcetype `aegis:chaos`); the chaos verification trace IS the Splunk observability artifact.
- **AI Ops Trust Layer**: `/v1/trust/posture` turns chaos survival, adaptive-immunity state, and stance-field evidence into a human-facing posture: `trusted`, `watch`, `degraded`, or `halt`.
- **One-line agent config**: drop-in OpenAI-SDK-compatible base URL. Existing agents do not need to be rewritten.

[ARCHITECTURE.md](./ARCHITECTURE.md) shows how aegis-splunk composes with Splunk MCP Server, Splunk hosted models, and the external providers.

## Track + bonus stack

- Primary: **Best of Platform & Developer Experience** ($3,000)
- Bonus: **Best Use of Splunk Hosted Models** ($1,000) — `gpt-oss-120b`, `gpt-oss-20b`, and Foundation AI Security are first-class providers in the hedge/fallback chain.

## Disclosure

`aegis-splunk` is built on top of an earlier sibling project, `aegis-resilient-agents`, which won the TrueFoundry "Resilient Agents" sub-track at DevNetwork [AI+ML] Hackathon 2026. The Splunk-specific work — MCP failover layer, Splunk hosted-models provider, HEC audit-log emission, chaos engine Splunk integration, the demo scenario over Splunk telemetry, the adaptive immunity organs (`src/aegis/immunity.ts`), the generative stance field (`src/aegis/stances.ts`), and this repository's architecture — is new for this hackathon. The core hedge / fallback / L4 semantic primitives are reused. Resubmission policy confirmed via `#splunk-ai-hackathon` Slack before submitting.

---

## Verify in 5 minutes (for judges)

Three things judges typically want to verify quickly. Each takes under 2 minutes.

### 1. Tests pass (60 seconds)

```bash
git clone https://github.com/Hokutoman00/aegis-splunk
cd aegis-splunk
bun install
bun test
```

Expected: **111 passing, 0 failing**, suite completes in ~1.7 seconds. Includes contract tests for the Splunk MCP proxy, HEC audit emitter (timeout + missing-token branches), Splunk-hosted Foundation AI Security hedging, the 4 adaptive immunity organs, the generative stance field, and the AI Ops Trust Layer.

### 2. Adaptive immunity + stance field run end-to-end (60 seconds)

```bash
bun test src/aegis/immunity.test.ts src/aegis/stances.test.ts src/aegis/l6-chaos-immunity.test.ts
```

Expected: **31 passing**. Covers `AntibodyCatalog`, `TCellMemory`, `InoculationScheduler`, `AutoimmuneGuard`, the recursive stance-generation loop that produces `Curator` / `Auditor` / `Cassandra` / `Historian`, and the integration that wires all four organs into the chaos engine.

### 3. HEC events appear in a real Splunk index (3 minutes — requires a local Splunk Enterprise install)

Skip if you don't have Splunk locally; the demo video at the top of the Devpost submission shows this running.

```bash
export SPLUNK_HEC_URL=http://localhost:8088/services/collector
export SPLUNK_HEC_TOKEN=<your-token>
bun run test-live-hec.ts  # sends 3 aegis:chaos + aegis:mcp-failover events
```

Expected: each event returns `{ "text": "Success", "code": 0 }`. Then in Splunk Web (`localhost:8000`), search:

```spl
index=main sourcetype="aegis:*" earliest=-10m
```

You should see the 3 events indexed, plus a stance-field snapshot field showing which initial stances voted and which emerged stances surfaced.

### 4. Trust posture says what the human should do next (30 seconds)

```bash
bun run dev
curl -sS http://localhost:3000/v1/trust/posture
```

Expected: a JSON posture with `level`, `score`, `human_gate`, `operator_next_action`, and evidence from chaos, immunity, and the stance field.

Offline replay without starting the server:

```bash
bun run trust:demo
```

### What the "refused to collapse" claim looks like in code

```bash
grep -n "refused_to_collapse" src/aegis/stances.ts
```

Expected: `refused_to_collapse: true` as a literal type, and `runStanceField()`'s return type intentionally omits `chosen`. The field of opinions is the output; the Splunk consumer (SOC analyst, dashboard, judge) selects their own rooting. Multi-agent frameworks always produce a chosen decision; we don't.

---

## The 7 layers

| Layer | Job | Owner | Invariant monitored |
|------:|---|---|---|
| **L0** | **Hedge** parallel requests on TTFT > p95 | Aegis | hedge cost < latency benefit (cost/latency receipt) |
| **L1** | **Retry** with exponential backoff + jitter | TF Gateway | retries are non-destructive (tool side-effect taxonomy) |
| **L2** | **Model fallback** within provider | TF Virtual Model | configured chain still has reachable models |
| **L3** | **Provider fallback** across providers | TF Virtual Model | TF Gateway itself is reachable (heartbeat) |
| **L4** | **Semantic error fallback** — error.type / .code | Aegis | error format stable (structured-first, regex fallback) |
| **L5** | **Graceful degradation contract** — budget / SLA / quality | Aegis | user contract is honored |
| **L6** | **Continuous self-chaos** in shadow | Aegis | chaos doesn't harm real users (output divergence monitored) |

Every response carries a signed **Aegis Receipt** — a JSON envelope showing which providers were tried, which layers fired, which contract budgets were spent, and how long ago Aegis last survived a chaos drill. See [docs/RECEIPT.md](./docs/RECEIPT.md).

## The differentiator: L4 catches what others miss

```
[2026-05-10 02:18:32]  user → Aegis → TF Virtual Model "claude-with-fallback"
[Aegis L0]             hedge fired (p95 = 1.5s exceeded)
[TF L1/L2]             anthropic/claude-sonnet-4.5 → 400 credit_balance_too_low
[TF L3]                fallback codes [401,403,...,503] don't include 400 → pass-through
[Aegis L4]             error.type=invalid_request_error + message="credit balance"
                       → reclassified as fallback-eligible
                       → routed to openai/gpt-4.1
[OpenAI]               200 OK, 320ms TTFT
[Aegis L0]             cancel hedge (cost saved: ~$0.0001)
[Aegis Receipt]        attached to response
```

This single error class (`credit_balance_too_low`) is what brings down most LLM apps the moment a credit card expires. Aegis is the first agent runtime to handle it.

## Demo scenarios

| # | Failure injected | Layers that fire | Visible UX |
|---|---|---|---|
| A | hedge race (p95 spike) | L0 only | "Hedge canceled in 80ms" annotation |
| B | Anthropic `credit_balance_too_low` 400 | L4 catches, routes to OpenAI | "Provider switched" + Receipt |
| C | MCP server (search) returns 30% errors | L0 MCP hedge (READ_HEDGE) wins | Slight latency, no error |
| D | TF Gateway itself returns 503 | TF SPOF bypass → direct provider | Receipt shows `tf_used: false` |
| E | All providers fail | L5 graceful contract + apologetic UX | Honest "I can't right now, but here's why" |
| F | Shadow chaos | L6 background drill | Receipt: `last_chaos_survival: 47s ago` |

All scenarios use chaos hooks in `src/aegis/l6-chaos.ts` to simulate provider and MCP outages. See `demo/video/SYNTHETIC_FALLBACK.md` for the full run-without-live-Splunk path.

## Quick start

```bash
bun install
cp .env.example .env.local
# fill in TRUEFOUNDRY_API_KEY, SPLUNK_SESSION_TOKEN, SPLUNK_HEC_URL, SPLUNK_HEC_TOKEN
# (see .env.example for all required variables)

bun run dev
# server: http://localhost:3000

# exercise every layer in one shot
bash examples/demo.sh

# Splunk AI Assistant (SAIA) drop-in integration example
bun run examples/saia-integration.ts
```

`/v1/chat/completions` is OpenAI SDK-compatible (non-streaming and SSE
streaming both). Drop-in for any code already using the OpenAI SDK — just
point `base_url` at Aegis instead of `api.openai.com`.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | identity / motto / configured virtual model |
| `GET` | `/health` | uptime probe |
| `POST` | `/v1/chat/completions` | OpenAI-compat chat (stream + non-stream) |
| `POST` | `/v1/mcp/classify` | classify a tool name (READ_HEDGE / WRITE_TIED / UNKNOWN_TIED) |
| `POST` | `/v1/mcp/call` | execute a tool with classification-aware resilience |
| `GET` | `/v1/chaos/status` | latest L6 chaos drill outcome |
| `GET` | `/v1/trust/posture` | AI Ops trust posture for the current agent runtime |

### Tests

```bash
bun test
# 111 tests, 0 fail, 347 assertions, ~1.7s
```

Lint / typecheck:

```bash
bun run lint && bun run typecheck
```

## Tech stack

- **Runtime**: [Bun](https://bun.sh) (≥1.3) + TypeScript (strict)
- **Server**: [Hono](https://hono.dev/) (with `streamSSE` for token streaming)
- **LLM**: OpenAI SDK pointed at TrueFoundry AI Gateway base URL
- **Agents**: [OpenAI Agents SDK (TypeScript)](https://openai.github.io/openai-agents-js/) for tool orchestration
- **MCP**: [TrueFoundry MCP Gateway](https://www.truefoundry.com/mcp-gateway) for tool servers
- **Chaos**: integrated chaos hooks in `src/aegis/l6-chaos.ts` + `src/aegis/immunity.ts` for shadow failure simulation
- **Trust Layer**: `src/aegis/trust-posture.ts` turns recovery evidence into a human-in-the-loop operating posture
- **Observability**: Splunk HEC (`aegis:chaos`, `aegis:mcp-failover` sourcetypes) feeding the Aegis Receipt
- **Lint/format**: [Biome](https://biomejs.dev/)

## Docs

- [docs/JUDGE_QUICK_VERIFY.md](./docs/JUDGE_QUICK_VERIFY.md) — shortest replay path for hackathon judges
- [docs/JUDGE_SCORECARD.md](./docs/JUDGE_SCORECARD.md) — strict self-evaluation, evidence map, and remaining risks
- [docs/AI_OPS_TRUST_LAYER.md](./docs/AI_OPS_TRUST_LAYER.md) — Grand Prize concept extension: trust posture rooted in Splunk evidence
- [docs/SPLUNK_DASHBOARD_QUERIES.md](./docs/SPLUNK_DASHBOARD_QUERIES.md) — SPL panels for chaos and MCP failover evidence
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — full 7-layer design, invariants, and degraded behaviors
- [docs/RECEIPT.md](./docs/RECEIPT.md) — Aegis Receipt JSON schema
- [AGENTS.md](./AGENTS.md) — coding-agent contract (conventions, no-go list, test commands)
- [docs/DEMO-SCRIPT.md](./docs/DEMO-SCRIPT.md) — 3-minute submission video plan (to be filled)

## Hackathon submission

| Field | Detail |
|---|---|
| Hackathon | [Splunk Agentic Ops Hackathon 2026](https://splunk.devpost.com/) |
| Primary track | Best of Platform & Developer Experience ($3,000) |
| Bonus track | Best Use of Splunk Hosted Models ($1,000) |
| Submission deadline | 2026-06-15 09:00 PDT |
| Team | Solo (Hokuto Torigoe) |

## Acknowledgments

Splunk for opening the Agentic Ops Hackathon with clear judging criteria and a genuinely open-ended agentic surface. TrueFoundry for the AI Gateway substrate underneath the aegis hedge/fallback primitives. The [LiteLLM issue #24320 thread](https://github.com/BerriAI/litellm/issues/24320) for documenting the industry-wide `credit_balance_too_low` gap that became aegis L4's clearest differentiator.

## License

MIT — see [LICENSE](./LICENSE).
