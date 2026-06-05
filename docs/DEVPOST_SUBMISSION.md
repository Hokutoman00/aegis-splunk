# aegis-splunk - Devpost Submission Text

Copy-paste source for the Splunk Agentic Ops Hackathon Devpost submission form at
<https://splunk.devpost.com/>. Each `## H2` below maps to a Devpost form field.

Submission target: **Splunk Agentic Ops Hackathon**
Primary track: **Best of Platform & Developer Experience** ($3,000)
Bonus track nominated in description: **Best Use of Splunk Hosted Models** ($1,000)

> Note on em-dashes: Devpost has historically rejected em-dash characters in
> the project title field. The "Project name" below uses hyphen-only. Em-dashes
> are fine in the long-form description.
> See `[[reference_hackathon_submission_workflow_2026-05-30]]`.

> Note on the title field: paste **slowly** (one character every ~100ms) into
> the title field on Devpost. React re-renders fast input and may swallow
> characters. The Playwright `slowly: true` mode is what we used previously.

---

## Project name

**aegis-splunk**

(Plain text, no em-dash, no slash. If Devpost auto-slugifies, the slug will be
`aegis-splunk` which matches the GitHub repo name.)

Alternative if Devpost rejects the hyphen for any reason:
**aegis splunk**

---

## Tagline (max 200 chars)

**AI Ops Trust Layer for Splunk agents: hedge across hosted models, recover when MCP fails, and tell the analyst whether to continue, watch, degrade, or halt.**

(157 chars — under the 200-char limit.)

---

## Description (long form, Markdown supported)

### The SOC analyst scenario

It is 02:14 AM. A SOC analyst is mid-P1 incident response. They open their
agentic assistant - built on Splunk's SAIA, reasoning over Splunk-hosted
models, calling Splunk MCP Server tools - and start an investigation. The
agent fires `splunk_search`, finds a failed-login spike, and begins assembling
the credential-stuffing hypothesis.

Then the LLM provider returns `429`. Or worse - `400 credit_balance_too_low`,
the failure class that **LiteLLM, OpenRouter, Portkey, and even TrueFoundry's
default Virtual Model fallback silently pass through** because the HTTP code
is in the 4xx range and the gateway's fallback list typically only covers
`[401, 403, 408, 429, 500, 502, 503]`. ([LiteLLM Issue #24320](https://github.com/BerriAI/litellm/issues/24320)
documents the industry-wide gap.) Simultaneously the Splunk MCP Server times
out. The agent goes dark. The analyst loses minutes they cannot afford to
lose, in a live incident.

### What aegis-splunk does

`aegis-splunk` sits **between an agent and the providers/MCP servers it
depends on**, and turns provider/MCP failures into Splunk-observable recovery.
It is OpenAI-SDK-compatible, so an existing agent only needs its `base_url`
re-pointed - no rewrite, no SDK swap, no protocol invention.

**Five capabilities:**

1. **Hedge across providers**, including Splunk hosted models. Parallel calls
   to Anthropic / OpenAI / Gemini and Splunk's hosted `gpt-oss-120b`,
   `gpt-oss-20b`, and Foundation AI Security. First usable response wins, late
   losers are canceled. The Splunk-hosted models are first-class entries in
   the hedge chain via `hedgeVia: 'splunk'` (`src/aegis/l0-hedge.ts`).

2. **Fallback chain that catches what gateways miss.** An L4 semantic layer
   inspects `error.type` / `error.code` / message text and reclassifies
   failures like `credit_balance_too_low`, `insufficient_quota`,
   `context_overflow`, and `model_unavailable` as fallback-eligible - even
   when the raw HTTP status code does not match the gateway's enum. This is
   the failure class no gateway in production handles today.

3. **MCP failover for Splunk MCP Server.** aegis-splunk proxies the official
   Splunk MCP Server (Splunkbase #7931). On primary 5xx / timeout / malformed
   response, the proxy transparently fails over to a thin **REST-backed shim**
   that exposes the same tool surface against Splunk's
   `/services/search/jobs` endpoint with the cached session token. The agent
   sees the same response shape either way. (`src/mcp/splunk-proxy.ts`)

4. **Continuous chaos verification exported to Splunk.** An L6 chaos engine
   periodically simulates provider and MCP outages **in shadow** and emits a
   structured event per drill via Splunk HEC (sourcetypes `aegis:chaos` and
   `aegis:mcp-failover`). **The chaos-verification trace IS the Splunk
   observability artifact** - the SOC team's existing dashboard becomes the
   resilience dashboard. No second tool to learn.
   (`src/aegis/splunk-audit.ts` + `src/aegis/l6-chaos.ts`)

5. **AI Ops Trust Layer.** `/v1/trust/posture` converts chaos survival,
   adaptive-immunity state, and stance-field evidence into a human-facing
   posture: `trusted`, `watch`, `degraded`, or `halt`. The output includes the
   human gate and the operator's next action, and the same posture is emitted
   into Splunk as `trust_posture` on `aegis:chaos` events.
   (`src/aegis/trust-posture.ts`)

### Three numbers

- **14 TypeScript modules** across `src/aegis/`, `src/mcp/`, `src/server/`,
  `src/chaos/`, `src/receipt/`, and `src/config.ts`.
- **111 passing tests** (`bun test`), 347 assertions, runs in ~1.7 seconds.
  Includes contract tests for the Splunk hosted-models provider, the HEC
  emitter (including timeout + missing-token degradation), Foundation AI
  Security hedge routing, and the MCP proxy REST shim.
- **Splunk MCP + Splunk hosted models + Splunk HEC, all three integrated.**
  Not "we depend on one Splunk surface and the rest is generic" - every
  Splunk-native surface in the agentic ops stack has a corresponding
  aegis-splunk module that exercises it.

### Track + bonus track

- **Primary track: Best of Platform & Developer Experience.** The
  drop-in OpenAI-SDK-compatible base URL means an existing agent does not
  need to be rewritten to gain resilience. The Aegis Receipt JSON envelope
  attached to every response gives developers a single artifact that names
  every layer that fired, every provider tried, and how long ago aegis-splunk
  last survived a chaos drill. The Trust Layer adds the human gate: continue,
  watch, approve degraded mode, or stop and review.

- **Bonus track: Best Use of Splunk Hosted Models.** `gpt-oss-120b`,
  `gpt-oss-20b`, and Foundation AI Security are first-class providers in the
  hedge AND the fallback chain. When Anthropic returns `credit_balance_too_low`,
  the L4 semantic layer reclassifies the failure and the Splunk-hosted
  `gpt-oss-120b` is what answers the analyst's question. The Splunk-hosted
  models are not a side feature - they are the **primary recovery path** when
  external providers degrade.

### How aegis-splunk satisfies the four Splunk Agentic Ops judging criteria

- **Technological Implementation.** 14 TypeScript modules, 111 passing tests,
  `bash demo/run-demo.sh` is the single-command reproducer. The hedge layer,
  MCP proxy + REST shim, HEC audit emitter, and AI Ops Trust Layer compose
  end-to-end and can be exercised on a local Splunk Enterprise trial.

- **Design.** Drop-in OpenAI-SDK-compatible base URL means existing agents do
  not need to be rewritten. The dashboard makes hedge wins, MCP failovers, and
  trust posture visible in the same Splunk index the SOC analyst is already
  watching.

- **Potential Impact.** Every major LLM provider has had a multi-hour outage
  in the past 12 months. Agentic AI in security operations means an LLM blink
  during a P1 incident is now a security incident in its own right.
  aegis-splunk keeps the agent provably alive across the outage and tells the
  analyst whether to continue, watch, degrade, or halt.

- **Quality of the Idea.** The chaos-verification trace IS the Splunk
  observability artifact - not a side channel. The Trust Layer turns Splunk
  into the place where humans root trust in agentic AI. The SOC team learns
  one tool, not two.

### Disclosure

`aegis-splunk` builds on an earlier sibling project, `aegis-resilient-agents`,
which won the TrueFoundry "Resilient Agents" sub-track at DevNetwork [AI+ML]
Hackathon 2026. The **Splunk-specific work is new for this hackathon**:

- MCP failover proxy targeting Splunk MCP Server #7931 (`src/mcp/splunk-proxy.ts`)
- Splunk hosted-models provider (`src/aegis/splunk-client.ts`) wired into the
  hedge/fallback chain
- HEC audit-log emission with `aegis:chaos` and `aegis:mcp-failover`
  sourcetypes (`src/aegis/splunk-audit.ts`)
- Chaos engine Splunk integration (HEC delivery of drill outcomes)
- AI Ops Trust Layer (`src/aegis/trust-posture.ts`, `/v1/trust/posture`)
- The SOC-P1 demo scenario over Splunk telemetry (`demo/`)
- This repository's architecture (`ARCHITECTURE.md`)

The core hedge / fallback / L4 semantic primitives are reused. Resubmission
policy confirmed via `#splunk-ai-hackathon` Slack before submitting.

### How we built it

- **Runtime**: Bun >=1.3 + TypeScript (strict)
- **Server**: Hono with `streamSSE` for token streaming
- **LLM client**: OpenAI SDK pointed at the TrueFoundry AI Gateway base URL
- **MCP**: Splunk MCP Server (Splunkbase #7931) as primary, REST shim against
  `/services/search/jobs` as fallback
- **Hosted models**: Splunk gpt-oss-120b / gpt-oss-20b / Foundation AI Security
  via Splunk's OpenAI-compatible chat-completions surface on the management port
- **Observability**: Splunk HEC (sourcetypes `aegis:chaos` + `aegis:mcp-failover`)
- **Trust posture**: `src/aegis/trust-posture.ts` + `/v1/trust/posture`
- **Validation**: Zod at every external boundary
- **Lint/format**: Biome
- **Tests**: Bun's built-in runner - 111 tests, 347 assertions, ~1.7 seconds

### Challenges we ran into

1. **TF Virtual Model `fallback_status_codes` is a fixed enum.** Adding `400`
   to the fallback list shows "Successfully updated" in the UI but is silently
   stripped on save. `credit_balance_too_low` is HTTP 400 - so it never
   triggers any gateway's built-in fallback. That gap **is** aegis L4.

2. **HEC must never be a SPOF for the request path.** Splunk HEC errors are
   swallowed by `splunk-audit.ts` so a slow or unreachable HEC endpoint
   cannot stall the agent's response. Tests cover the missing-token and
   timeout-abort branches.

3. **MCP hedging would double-fire writes.** Our classifier reads the tool
   name pattern plus an opt-in `x-aegis-idempotent: true` annotation, then
   routes write/unknown tools to a TIED policy (single fire + idempotency-key
   retry) so a `splunk_search` (READ_HEDGE) can race two MCP servers while a
   hypothetical `splunk_delete_index` (WRITE_TIED) cannot.

### What's next

- Real Toxiproxy-driven chaos drills in production shadow traffic (currently
  synthetic in v0).
- A Splunk dashboard XML committed alongside `demo/seed-data/` so judges and
  operators can install both with a single `splunkbase install`.
- Streaming hedge with TTFT-aware cancellation: race two streams from the
  start, hand the client the faster one.

---

## Built with (Devpost tag list)

Devpost asks for tags as a comma-separated or chip list. Use these 15:

```
typescript
bun
hono
openai-sdk
anthropic
splunk
splunk-mcp
mcp
gpt-oss
hec
splunk-cloud
ffmpeg
msedge-tts
mermaid
mit
```

---

## Track selection

**Primary**: Best of Platform & Developer Experience ($3,000)

**Bonus** (nominated in the description body, not always a separate Devpost
field): Best Use of Splunk Hosted Models ($1,000)

If Devpost shows a "Prize categories" or "Track" multi-select, check
**Best of Platform & Developer Experience** as primary. If a separate
checkbox for **Best Use of Splunk Hosted Models** exists, check that too.

---

## Try it out (Devpost "links" section)

| Devpost field | Value |
|---|---|
| GitHub | <https://github.com/Hokutoman00/aegis-splunk> |
| Video | https://youtu.be/EhCKT7-h5ro |

Demo video: 2:55, unlisted, 9-scene synthetic walkthrough. Covers L4 semantic
fallback, gpt-oss-120b hedge, MCP REST shim failover, trust_posture transitions,
HEC events indexed, and MTTR receipt.

---

## Required artifacts (the four things judges will look for)

1. **Architecture diagram**: `architecture_diagram.md` at the repo root - Mermaid
   `flowchart LR` covering Agent -> aegis-splunk middleware -> LLM Providers
   (including Splunk hosted) + Splunk MCP layer + Splunk Observability (HEC,
   indexes, dashboard). Yellow nodes are Splunk-native, blue is the agent,
   green is external providers.

2. **README**: <https://github.com/Hokutoman00/aegis-splunk/blob/master/README.md>
   has the 7-layer table, the demo scenario table (A-F), quick-start, and
   `bun test` instructions.

3. **Judge quick verify**: `docs/JUDGE_QUICK_VERIFY.md` gives judges the
   shortest replay path, `docs/JUDGE_SCORECARD.md` maps the evidence to a
   strict 93/100 self-evaluation, `docs/AI_OPS_TRUST_LAYER.md` explains the
   Grand Prize concept extension, and `docs/SPLUNK_DASHBOARD_QUERIES.md` gives
   the SPL panels for `aegis:chaos` and `aegis:mcp-failover` evidence.

4. **License**: MIT, in `LICENSE` at the repo root, detected by GitHub on the
   repo landing page.

5. **One-command reproducer**: `bash demo/run-demo.sh` brings up the server,
   the chaos cascade, and the agent client in deterministic order. Detailed
   operator setup in `demo/README.md`.

---

## Team

Hokuto Torigoe - solo developer.

---

## Acknowledgments

Splunk for opening the Agentic Ops Hackathon with such a clear set of judging
criteria. TrueFoundry for the AI Gateway substrate that sits underneath the
aegis hedge/fallback primitives. The LiteLLM Issue #24320 thread for
documenting the industry-wide `credit_balance_too_low` gap that became aegis
L4's clearest differentiator.
