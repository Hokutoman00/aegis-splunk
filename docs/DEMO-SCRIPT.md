# aegis-splunk — Demo Video Script

Submission video for the **Splunk Agentic Ops Hackathon 2026**. Final cut: `demo/video/aegis-splunk-demo-v2.mp4` (~75 seconds, narrated).

## Format

- **Container**: MP4 H.264 + AAC, 1920×1080, 30fps
- **Narration**: Windows SAPI (en-US, Zira) — see `demo/video/narration.ps1`
- **Assembly**: ffmpeg concat via `demo/video/assemble-synthetic.py`
- **Upload**: YouTube unlisted, link in Devpost submission

## Spine

```
[0:00 – 0:05]  TITLE CARD       — "aegis-splunk" + tagline
[0:05 – 0:11]  DASHBOARD        — plain Splunk dashboard, no events
[0:11 – 1:03]  6 OVERLAY SCENES — each 8s, one failure/recovery per overlay
[1:03 – 1:15]  CLOSING CARD     — GitHub URL + MIT + tagline
```

## Scene sequence

| Scene | Failure injected | Layer(s) | Overlay text |
|---|---|---|---|
| 1 | SOC analyst agent goes dark at 2:14 AM | — | Hook / context |
| 2 | Anthropic `400 credit_balance_too_low` | L4 | "L4 reclassifies 400 → fallback-eligible" |
| 3 | L0 hedge fires, gpt-oss-120b takes over | L0 | "Splunk gpt-oss-120b wins the race" |
| 4 | Splunk MCP Server times out | MCP proxy | "REST shim failover — agent never blinks" |
| 5 | HEC audit emitted | HEC | "aegis:chaos + aegis:mcp-failover indexed" |
| 6 | MTTR / receipt | — | "Mean time to recovery: 1.8s" |

## Narration (from narration.ps1)

```
Two fourteen AM. Your agentic SOC analyst goes dark mid incident.
aegis splunk keeps it alive, and emits the proof as Splunk events.
Splunk MCP server is called for failed login data.
Anthropic returns four hundred credit balance too low. MCP times out.
L zero hedge fires. Splunk hosted GPT OSS one twenty B takes over.
MCP proxy fails over to the REST shim. The agent never blinks.
Every recovery emits aegis chaos and aegis MCP failover events.
Mean time to recovery: one point eight seconds. Receipt: layers fired L zero, L four, MCP.
aegis splunk. Hedge first, fallback second, continuously chaos verified. MIT licensed.
```

## Reproduce the video locally

```bash
# Step 1: regenerate narration WAV (Windows only, requires SAPI)
pwsh demo/video/narration.ps1

# Step 2: render scene frames
python demo/video/render_frames.py

# Step 3: assemble with narration
python demo/video/assemble-synthetic.py
# output: demo/video/aegis-splunk-demo-v2.mp4
```

See `demo/video/SYNTHETIC_FALLBACK.md` for the full run-without-live-Splunk path.
