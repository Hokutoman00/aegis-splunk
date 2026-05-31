# aegis-splunk — Demo Scenario (3-minute video screenplay)

Target cut: **2:55**. Format: 1920×1080 @ 30fps, msedge-tts narration (`en-US-AriaNeural`), split-screen — agent chat on the left (60%), Splunk dashboard on the right (40%).

Recording orchestrator: `demo/run-demo.sh` brings up the server, the chaos cascade, and the agent client in deterministic order so the video can be re-shot until the take is clean.

---

## Beat sheet

| Beat | Time | Left pane | Right pane | Audio | Overlay |
|---|---|---|---|---|---|
| 1 — Setup | T+0:00 → T+0:20 | SOC analyst's chat window, idle prompt | Splunk dashboard: `index=main sourcetype=aegis:*` 0 events | Cold-open narration | Title card: **"P1 incident response — 02:14 AM"** |
| 2 — Investigation begins | T+0:20 → T+0:55 | Agent runs `splunk_search` via MCP, returns failed-login spike | Dashboard refreshes, failed-login bar chart climbs | "The agent is doing exactly what it was built to do…" | Lower-third: **MCP tool: `splunk_search` — Splunk MCP Server #7931** |
| 3 — Outage strikes | T+0:55 → T+1:25 | Agent visibly stalls mid-sentence | Dashboard: red banner — `429 anthropic` + `503 splunk_mcp` | Tension cue | Overlay: **`CHAOS: anthropic_429` `CHAOS: splunk_mcp_503`** |
| 4 — aegis-splunk hedges | T+1:25 → T+2:00 | Agent resumes, response continues seamlessly | New events arriving — `sourcetype=aegis:chaos`, `sourcetype=aegis:mcp-failover` | "Layer zero fires…" | Overlay: **`HEDGE → gpt-oss-120b (Splunk hosted)`** then **`MCP REST shim engaged`** |
| 5 — Splunk shows the win | T+2:00 → T+2:30 | Receipt JSON streams into the chat as a debug fold | Dashboard panel highlights: `winner=hedge`, `fallback_used=true`, `survival_rate=1.0` | "Every recovery is a Splunk event." | Lower-third: **HEC sourcetypes: `aegis:chaos`, `aegis:mcp-failover`** |
| 6 — Recovery complete | T+2:30 → T+2:50 | Agent delivers investigation summary; analyst types "thanks" | Dashboard: green — recovery latency < 2s | "The analyst saw no break." | Overlay: **`MTTR: 1.8s` `Receipt: layers_fired=[L0, L1, L4]`** |
| 7 — Close | T+2:50 → T+2:55 | Black card → 13-tag arch diagram | — | "aegis-splunk. Open source. MIT." | **github.com/Hokutoman00/aegis-splunk · MIT** |

---

## Narrator copy (TTS-ready)

The lines below are what `msedge-tts en-US-AriaNeural` reads. Em-dashes have been replaced with comma pauses so the TTS doesn't choke (see `feedback_hackathon_submission_workflow` em-dash gotcha).

### Beat 1 — Setup [T+0:00]
> "Two AM. P1 incident. A SOC analyst opens their agentic assistant, built on Splunk's SAIA, and starts an investigation. The agent reasons over a hosted model and calls Splunk MCP tools to pull telemetry. This is the happy path, and it usually works."

### Beat 2 — Investigation begins [T+0:20]
> "The agent searches Splunk for the failed-login spike around two AM. It returns three source IPs, one targeted username, and one suspicious successful login at the end. Twenty seconds in, the analyst already has the shape of the attack."

### Beat 3 — Outage strikes [T+0:55]
> "Now the failures land. The Anthropic API returns four-twenty-nine. The Splunk MCP Server returns five-oh-three. The agent's reasoning loop and its tool loop break in the same second. Without resilience, the analyst is now staring at a hung chat window in the middle of a live incident."

### Beat 4 — aegis-splunk hedges [T+1:25]
> "Layer zero fires. aegis-splunk had already raced a duplicate request to Splunk's hosted `gpt-oss-120b` model. The hedge wins. The MCP proxy detects the five-oh-three and quietly routes the same tool call through a REST shim that hits Splunk's search jobs endpoint directly. Same answer, same shape, different path."

### Beat 5 — Splunk shows the win [T+2:00]
> "Every recovery is a Splunk event. The chaos drill outcome lands in sourcetype `aegis colon chaos`. The MCP failover lands in sourcetype `aegis colon m-c-p-failover`. The SOC team's existing dashboard is also the resilience dashboard. There is no second tool to learn."

### Beat 6 — Recovery complete [T+2:30]
> "The analyst sees no break. The agent finishes the investigation, names the compromised user, lists the source IPs, and flags credential stuffing. Mean time to recover, one point eight seconds. The receipt records every layer that fired, every provider that was tried, and how long ago aegis last survived an injected failure."

### Beat 7 — Close [T+2:50]
> "aegis-splunk. Drop in under any agent that speaks OpenAI. M-I-T license. Link below."

---

## On-screen overlay text (per beat, exact strings)

```
T+0:00  P1 incident response — 02:14 AM
T+0:20  MCP tool: splunk_search · Splunk MCP Server #7931
T+0:55  CHAOS: anthropic_429 · CHAOS: splunk_mcp_503
T+1:25  HEDGE → gpt-oss-120b (Splunk hosted)
T+1:35  MCP REST shim engaged → /services/search/jobs
T+2:00  HEC sourcetypes: aegis:chaos · aegis:mcp-failover
T+2:30  MTTR: 1.8s · Receipt: layers_fired=[L0, L1, L4]
T+2:50  github.com/Hokutoman00/aegis-splunk · MIT
```

---

## Capture checklist (operator)

1. Splunk Enterprise local, HEC enabled, token in `SPLUNK_HEC_TOKEN`.
2. Dashboard saved as `aegis-splunk-demo`, panels: failed-login count over time, `aegis:chaos` table, `aegis:mcp-failover` table, recovery latency single-value.
3. `bun run demo/run-demo.sh` from one shell.
4. OBS source A = terminal window, source B = browser tab on the Splunk dashboard.
5. Recording window is one shot, ~3:00, no cuts. Re-run `run-demo.sh` between takes — it is deterministic.
6. Narration is dubbed in post via `.claude/video/scripts/tts-to-file.mjs` against the lines above.
