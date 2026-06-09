# Synthetic Video Fallback Plan (Plan B)

This file documents the contingency for recording the 3-minute hackathon demo
video **without a live Splunk Cloud session token**.

## When to invoke Plan B

If the user has **NOT** provisioned a Splunk Cloud trial and exported
`SPLUNK_SESSION_TOKEN`, `SPLUNK_HEC_URL`, and `SPLUNK_HEC_TOKEN` by
**2026-06-12 (3 days before the 2026-06-15 09:00 PDT deadline)**, switch to
Plan B. Otherwise stick with Plan A (live recording per
`demo/video/storyboard.md`).

The 3-day buffer is non-negotiable: it covers re-takes if the first recording
has audio/video glitches, YouTube upload time (5-15 min), Devpost form fill
(~10 min), and the 24-hour "submit early" buffer per
`docs/SUBMIT-CHECKLIST.md`.

## What Plan B looks like

Plan B uses `bash demo/run-demo-dryrun.sh` instead of `bash demo/run-demo.sh`.
The differences:

| Aspect | Plan A (live) | Plan B (synthetic) |
|---|---|---|
| Splunk Cloud | required | not required |
| `.env.local` | required with real `SPLUNK_*` | not required (script sets dummy env inline) |
| TrueFoundry token | required (real JWT) | not required (dummy placeholder) |
| Chaos script output | stdout + Splunk HEC | stdout only (HEC returns `attempted:false`) |
| MCP proxy | real MCP server -> REST shim | mock callers in `src/mcp/mock-caller.ts` |
| Agent LLM stream | real tokens from gpt-oss-120b | L5 graceful degradation (synthetic response) |
| Splunk dashboard pane | real events arriving | not shown - replace with chaos-script stdout pane |

The architecture is identical; only the upstream backends differ.

## Recording script for Plan B (15 minutes total)

### Pre-record (one-time setup, ~5 min)

1. Open OBS Studio.
2. Configure two captures:
   - Left pane (60%): VS Code or terminal showing the agent-client output
   - Right pane (40%): a second terminal tailing
     `demo/.logs/chaos-dryrun-*.log` (instead of the Splunk dashboard pane
     in Plan A)
3. Add a **persistent text overlay** at the top of the frame:

   ```
   SYNTHETIC SPLUNK RESPONSES - see ARCHITECTURE.md for live integration
   ```

   Use OBS Text (GDI+) source. White text, semi-transparent black background,
   16px, top-center. This is non-negotiable - the overlay is what makes the
   submission honest. Judges should never have to guess whether they are
   looking at real Splunk telemetry.

4. Configure recording: 1920x1080 @ 30fps, H.264 + AAC, target file size
   under 100 MB (typical 3-minute 1080p clip is 5-10 MB).

### Record (one take, ~3 minutes)

1. Click OBS "Start Recording".
2. In the left-pane terminal:
   ```bash
   cd c:/Users/hokut/Desktop/aegis-splunk
   bash demo/run-demo-dryrun.sh
   ```
3. In the right-pane terminal, immediately:
   ```bash
   cd c:/Users/hokut/Desktop/aegis-splunk
   tail -f $(ls -t demo/.logs/chaos-dryrun-*.log | head -1)
   ```
4. Read the narrator script from `demo/SCENARIO.md` aloud (or pre-render with
   msedge-tts and play it during the take). Match the cascade beats:
   - T+0:00 - cascade_start (visible in chaos log + cold-open narration)
   - T+0:20 - investigation begins (left pane shows agent_start +
     mcp_call_start)
   - T+0:55 - inject_anthropic_429 (visible in chaos log right pane)
   - T+1:00 - inject_splunk_mcp_503 (visible in chaos log right pane)
   - T+1:25 - L0 hedge / L4 semantic fires (server log shows 200 OK on
     chat.completions, demonstrating graceful degradation contract)
   - T+1:35 - REST shim engaged (chaos log mcp-failover event)
   - T+2:30 - cascade_end + agent_complete
   - T+2:50 - close card
5. Click OBS "Stop Recording".

### Post-record (~5 min)

1. Trim to 2:55 in your editor of choice (DaVinci Resolve free is fine).
2. Add **one additional overlay banner** at T+0:05 reading:
   ```
   Synthetic mode: no live Splunk required. Architecture is identical to
   the live path. See ARCHITECTURE.md.
   ```
   Hold for 8 seconds, then fade.
3. Export H.264 + AAC, 1080p.
4. Upload to YouTube per `docs/SUBMIT-CHECKLIST.md` "Video upload" section.

## What the judge sees, and why it is honest

The judge will see:

- A real `bash demo/run-demo-dryrun.sh` orchestrator
- Real chaos cascade events scrolling in the right pane (with timestamps
  matching the storyboard)
- A real `bun run src/server/index.ts` server responding to real HTTP
  requests (the L5 graceful-degradation 200 OK is real, not faked)
- Real `bun run demo/agent-client.ts` SOC agent client driving the demo
- The persistent SYNTHETIC overlay so they know HEC and MCP are mocked

What is mocked:
- HEC POST returns `attempted: false` (the real path is `splunk-audit.ts`
  but it needs a token)
- MCP primary/secondary use `mock-caller.ts` (the real path is
  `splunk-proxy.ts` REST shim but it needs a Splunk REST endpoint)
- LLM token stream returns L5 graceful response (the real path is TF AI
  Gateway -> Anthropic/OpenAI/Splunk hosted, but it needs a real TF token)

What is **identical** to the live path:
- All 14 TypeScript modules in `src/`
- All 111 tests pass (`bun test`)
- The request flow: agent -> L0 hedge -> L4 semantic -> L5 contract ->
  receipt
- The MCP flow: classifier -> hedge -> mock-caller (live: -> splunk-proxy
  -> REST shim)
- The chaos cascade timing and event shape
- The architecture in `ARCHITECTURE.md`

## Why Plan A is still preferred

Plan A produces a Splunk dashboard pane on the right showing real events
arriving in real time with `sourcetype=aegis:chaos` and
`sourcetype=aegis:mcp-failover`. That is the most direct visual evidence
that "the chaos-verification trace IS the Splunk observability artifact"
(the differentiator quoted in the Devpost submission).

Plan B's chaos-log right pane is functionally equivalent (same event shapes,
same timing) but is text-only and lacks the "look, real Splunk dashboard"
visual. Judges may discount it slightly.

**Strictly: Plan A is the goal; Plan B is the contingency to avoid
zero-submission risk.**

## Decision deadline

- 2026-06-12 12:00 PDT: user must have provisioned Splunk Cloud trial +
  exported tokens. If not, switch to Plan B that day.
- 2026-06-13 12:00 PDT: video must be recorded (Plan A or B). Upload after.
- 2026-06-14 09:00 PDT: Devpost form submitted (24-hour buffer to the
  2026-06-15 09:00 PDT deadline).
