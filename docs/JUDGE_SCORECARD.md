# Judge Scorecard

Strict self-evaluation for the Splunk Agentic Ops Hackathon submission.

## Current Score

**93 / 100** after the Trust Layer extension and local quality gate pass.

This is not a claim that the project will win. It is a repo-readiness score:
how quickly a judge can verify the submission, how directly it maps to Splunk
surfaces, and how much technical evidence exists without relying on a live demo.

## Rubric

| Axis | Score | Evidence | Remaining Gap |
|---|---:|---|---|
| Splunk-native implementation | 24 / 25 | Splunk hosted-model client, MCP proxy fallback, HEC audit emitter, SPL dashboard queries | Hosted model and MCP endpoint shapes are still documented as inferred unless run against a judge-owned Splunk environment |
| Technical quality | 25 / 25 | `bun test`, `bun run lint`, and `bun x tsc --noEmit` pass locally; 111 tests, 347 expect calls | No committed CI result in this working tree yet |
| Demo and replay clarity | 19 / 20 | `docs/JUDGE_QUICK_VERIFY.md`, `docs/SPLUNK_DASHBOARD_QUERIES.md`, demo scripts, v3 video (2:55, https://youtu.be/EhCKT7-h5ro) uploaded and Devpost updated | Live Splunk recording not included — synthetic overlays only |
| Differentiation | 15 / 15 | AI Ops Trust Layer under SAIA-style agents, not another incident-summary assistant; L4 catches `credit_balance_too_low`; MCP failover and trust posture are Splunk-observable | Needs concise positioning in the final video description |
| Operational honesty | 12 / 15 | Disclosure of reused Aegis primitives, dry-run path, live Splunk prerequisites, no-secret placeholders, and explicit 40% Grand probability gate | Live Splunk verification is environment-dependent |

## Why The Score Is Above 90

The project now has three judge-friendly proof layers:

1. **Static proof**: architecture, scorecard, quick verify, and SPL dashboard
   docs point to exact files and commands.
2. **Automated proof**: tests, lint, and typecheck are clean locally.
3. **Operational proof**: the demo path emits Splunk HEC-shaped telemetry for
   chaos drills, MCP failovers, and trust posture, so recovery is observable
   instead of only narrated.

## What Would Move It Higher

| Action | Expected Lift | Risk |
|---|---:|---|
| ~~Upload the final v2 video and update Devpost~~ | ~~+3 to +5~~ | **DONE**: v3 video (2:55) uploaded https://youtu.be/EhCKT7-h5ro, Devpost updated |
| Add a committed CI badge from GitHub Actions | +1 to +2 | Requires push and workflow run |
| Run the live Splunk path on a clean Splunk Enterprise trial and attach screenshots | +2 to +4 | Requires local service state and possible credentials |
| Confirm Splunk MCP Server wire format against the real server | +2 | Requires live Splunk MCP access |
| Show `/v1/trust/posture` in the final video beside Splunk dashboard panels | +2 to +3 | Requires video update |

## Judge Reading Order

1. `README.md` for the premise, layers, and 5-minute verify path.
2. `docs/JUDGE_QUICK_VERIFY.md` for exact commands.
3. `docs/SPLUNK_DASHBOARD_QUERIES.md` for Splunk observability panels.
4. `docs/AI_OPS_TRUST_LAYER.md` for the Grand Prize concept extension.
5. `tests/unit/splunk-hedge.test.ts`, `src/mcp/splunk-proxy.test.ts`, and
   `src/aegis/splunk-audit.test.ts` for the three Splunk-native proof points.
6. `src/aegis/trust-posture.test.ts` for the trusted/watch/degraded/halt
   branches.
7. `examples/saia-integration.ts` for the one-line SAIA-style integration.

## Grand Prize Probability Gate

Honest estimate (post-video upload, post-Trust Layer): **28–38%** first-place
probability in the Platform & Developer Experience track. This is based on:
- Competitive landscape unknown (gallery not public pre-deadline)
- Technical differentiators are real and verifiable (L4 gap, Trust Layer, 111 tests)
- Video (2:55 synthetic) narrates the scenario but lacks live Splunk recording

Remaining credible lift actions:
1. Live Splunk screenshot showing `trust_posture.level` indexed as HEC event.
2. Confirm Splunk hosted model wire format against a real API endpoint.
3. Show `/v1/trust/posture` beside Splunk dashboard panels in a future video cut.

## Hard Risks To Avoid

- Do not publish real `SPLUNK_HEC_TOKEN`, `SPLUNK_SESSION_TOKEN`, provider API
  keys, or Devpost cookies.
- Do not claim that the inferred hosted-model or MCP wire format was live-hit
  unless that run is actually performed.
- Do not replace the Devpost video URL without checking that the YouTube video
  is unlisted, playable logged-out, and under 3 minutes.
