# AI Ops Trust Layer

Grand Prize positioning: aegis-splunk is not just a resilience middleware. It
is an **AI Ops Trust Layer** for Splunk-backed agents.

Most incident assistants answer the analyst's question. aegis-splunk answers a
harder operational question:

> Can the analyst trust this AI system's next move right now?

## Concept

Every agent response already carries an Aegis Receipt. Every chaos drill and
MCP failover already emits Splunk telemetry. The Trust Layer composes those
signals into a human-readable operating posture:

| Posture | Meaning | Human gate |
|---|---|---|
| `trusted` | Fresh chaos survival, active immunity, and multi-stance evidence agree | Continue investigation |
| `watch` | System is healthy but trust evidence is old or shallow | Keep analyst in loop, run another shadow drill |
| `degraded` | Trust evidence is insufficient for automation | Read-only investigation, human approval before action |
| `halt` | Latest drill failed or autoimmune guard disabled drills | Stop autonomous action and review recovery in Splunk |

This is deliberately human-in-the-loop. Aegis does not say "the AI is always
safe." It says what evidence exists, what is stale, and what the operator
should do next.

## Implementation

- `src/aegis/trust-posture.ts` computes `level`, `score`, `human_gate`,
  `operator_next_action`, and evidence from:
  - `L6ChaosRecord`
  - adaptive immunity state
  - the stance field's refusal to collapse to one hidden decision
- `GET /v1/trust/posture` exposes the current posture for dashboards and judge
  replay.
- `bun run trust:demo` replays the four postures without server, Splunk, or
  provider credentials.
- `runDrillAndEmit()` includes `trust_posture` inside `aegis:chaos` HEC events
  so the posture is queryable in Splunk.
- `src/aegis/trust-posture.test.ts` verifies the trusted/watch/degraded/halt
  branches.

## Why This Raises The Grand Prize Ceiling

The Grand Prize is unlikely to go to another incident assistant. Competitors can
show triage, RCA, and remediation dashboards. The stronger claim is:

1. Those assistants need a trust boundary under them.
2. Splunk is the right place to root that trust because it already owns
   operational truth.
3. aegis-splunk turns model failures, MCP failures, chaos evidence, and
   multi-stance reasoning into one operator-facing trust posture.

That reframes the project from "a tool that survives outages" to "a platform
primitive for trustworthy agentic operations."

## Grand Prize Probability Gate

Local implementation can raise the repository-readiness score above 90, but a
credible 40% Grand Prize probability requires external proof:

| Requirement | Why it matters |
|---|---|
| Final public video under 3 minutes | The Trust Layer must be visible in one SOC-P1 story |
| Live Splunk screenshot or recording | Judges need to see `trust_posture` in Splunk, not only in tests |
| Devpost description rewritten around Trust Layer | The concept must land before judges inspect code |
| Hosted Models / MCP live wire-format confirmation | Removes the largest implementation uncertainty |

Without those, 40% would be an inflated estimate.

## Local Replay

```bash
bun run trust:demo
```

Expected output: four JSON blocks named `TRUSTED`, `WATCH`, `DEGRADED`, and
`HALT`, each with `score`, `human_gate`, `operator_next_action`, `rationale`,
and evidence fields.
