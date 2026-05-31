# aegis-splunk - Pre-Submit Checklist

This file is the minimum verification + user-action sequence to take the repo
+ a finished demo video to a filed Devpost submission for the **Splunk Agentic
Ops Hackathon**.

- **Submit URL**: <https://splunk.devpost.com/>
- **Hard deadline**: 2026-06-15 09:00 PDT (= 2026-06-16 01:00 JST)
- **Target submit time**: 2026-06-14 09:00 PDT (24 hours of buffer)
- **Repo**: <https://github.com/Hokutoman00/aegis-splunk>
- **Copy-paste source for form fields**: `docs/DEVPOST_SUBMISSION.md`

Estimated user time at submit (assuming repo + video are ready): **~15 minutes**.

---

## Pre-flight verification (run before submitting)

### Repo integrity

- [ ] Repo is **public** on GitHub - <https://github.com/Hokutoman00/aegis-splunk>
- [ ] **MIT license** is detected by GitHub on the repo landing page (look for
  the "MIT License" badge next to the repo name on github.com)
- [ ] `ARCHITECTURE.md` exists **at the repo root** (not just under `docs/`)
- [ ] Open `ARCHITECTURE.md` on github.com and confirm the Mermaid
  `flowchart LR` block **renders correctly** (yellow Splunk-native nodes,
  blue agent, green external providers). If it shows raw mermaid source,
  fix the fence and re-push.
- [ ] `README.md` has setup + run instructions (`bun install` -> `bun run dev`
  -> `bash examples/demo.sh` or `bash demo/run-demo.sh`)

### Tests + types + lint

- [ ] `bun test` -> **68 pass, 0 fail** (~1.2s)
- [ ] `bun x tsc --noEmit` -> exit code 0 (no type errors)
- [ ] `bun run lint` if defined in `package.json` -> exit code 0 (Biome clean)

### Secret hygiene (HARD GATE before public push)

Run from the repo root:

```bash
git ls-files | xargs grep -l -E "(sk-[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{36}|eyJ[A-Za-z0-9_-]{30,}\.eyJ)" 2>/dev/null
```

- [ ] Output is **empty** (no tracked file contains a real key)
- [ ] `.env.local` is in `.gitignore` and is **not** in `git ls-files`
- [ ] `.env.example` documents every `SPLUNK_*` variable (already done):
  `SPLUNK_HOSTED_MODELS_BASE`, `SPLUNK_SESSION_TOKEN`, `SPLUNK_HEC_URL`,
  `SPLUNK_HEC_TOKEN`, `SPLUNK_MCP_URL`

### Dry-run smoke (works without live Splunk)

- [ ] `bash demo/run-demo.sh` runs to completion (or the dry-run variant
  `bash demo/run-demo-dryrun.sh` if no live TF + Splunk available). The
  cleanup section fires, no orphan processes left. See
  `demo/video/SYNTHETIC_FALLBACK.md` for the Plan B video path.

---

## Video upload (~5 min)

### Plan A: live Splunk recording

Prereq: user has provisioned a Splunk Cloud trial and exported
`SPLUNK_SESSION_TOKEN`, `SPLUNK_HEC_URL`, `SPLUNK_HEC_TOKEN`.

1. `bash demo/run-demo.sh` while OBS records the screen (split: agent chat
   left 60%, Splunk dashboard right 40%, per `demo/SCENARIO.md`).
2. Open OBS, target a 2:55 cut at 1920x1080 @ 30fps.
3. After the cascade completes, stop recording. Trim to the storyboard beats
   in `demo/video/storyboard.md`.

### Plan B: synthetic dry-run recording (contingency)

If `SPLUNK_SESSION_TOKEN` is **not** provisioned by 2026-06-12, fall back to
the synthetic path documented in `demo/video/SYNTHETIC_FALLBACK.md`:

- Record `bash demo/run-demo-dryrun.sh` with the chaos script's stdout output
  visible. Overlay the banner "synthetic Splunk responses - see ARCHITECTURE.md
  for live integration" so judges know it is honest.

### YouTube upload

- [ ] Open <https://studio.youtube.com> while logged into the Google account
  that should host the submission video.
- [ ] **CREATE -> Upload videos**.
- [ ] Drag in the recording.
- [ ] **Title**: `aegis-splunk - Resilience for Splunk's Agentic Stack (Splunk Agentic Ops Hackathon 2026)`
      (Note: hyphen, NOT em-dash. Em-dashes are rejected by some Devpost
      title fields and YouTube auto-replaces unicode sometimes.)
- [ ] **Description**: paste the block below
  ```text
  aegis-splunk sits between an agent and the providers / MCP servers it
  depends on, and turns provider / MCP failures into Splunk-observable
  recovery.

  Hedge across Splunk-hosted gpt-oss-120b and external LLMs.
  Fall back when Splunk MCP times out, via a REST shim against
  /services/search/jobs.
  Emit every recovery as a Splunk HEC event the SOC team already watches.

  Closes the industry-wide gap documented in LiteLLM Issue #24320 - every
  major LLM gateway passes Anthropic 400 credit_balance_too_low straight
  through. aegis L4 inspects error.type / error.code, recognizes the
  failure class, and re-routes - including to Splunk hosted models.

  Every response carries a signed Aegis Receipt - a JSON envelope with the
  full layer trace.

  GitHub:    https://github.com/Hokutoman00/aegis-splunk
  Hackathon: https://splunk.devpost.com/
  Tracks:    Best of Platform & Developer Experience (primary)
             Best Use of Splunk Hosted Models (bonus)
  ```
- [ ] **Visibility -> Unlisted**.
- [ ] **Save**.
- [ ] Copy the share URL (`https://youtu.be/...`).

Constraints to verify before saving:

- [ ] Video duration is **under 3 minutes** (Splunk hackathon spec; typical
  hackathon ceiling). Target 2:55.
- [ ] Resolution >= 1080p.
- [ ] Audio is clear; no clipping. (msedge-tts en-US-AriaNeural per
  `demo/SCENARIO.md`.)

---

## Devpost form (~10 min)

1. Open <https://splunk.devpost.com/> and click **Submit project**.

2. Fill each field from `docs/DEVPOST_SUBMISSION.md`:

   | Devpost field | Source in DEVPOST_SUBMISSION.md | Notes |
   |---|---|---|
   | Project name | "## Project name" | `aegis-splunk` (hyphen, **no em-dash**) - paste slowly |
   | Tagline (200 char) | "## Tagline" | 196 chars, under limit |
   | Description (long, MD) | Everything under "## Description (long form, Markdown supported)" | Markdown supported, ~9 KB |
   | Built with (tags) | "## Built with (Devpost tag list)" | 15 tags |
   | Try it out - GitHub | <https://github.com/Hokutoman00/aegis-splunk> | |
   | Try it out - Video | YouTube unlisted URL from upload step | |

3. **Track selection** (Devpost "Prize categories" or "Tracks"):
   - [ ] Check **Best of Platform & Developer Experience** (primary)
   - [ ] Check **Best Use of Splunk Hosted Models** if a separate checkbox
         exists for the bonus track
   - [ ] If the bonus track is not a separate checkbox, the description body
         already nominates it - no extra action needed

4. **Em-dash sanitization on title field**: confirm the title shows
   `aegis-splunk` with a hyphen, not `aegis–splunk` (en-dash) or
   `aegis—splunk` (em-dash). Some clipboard managers silently convert hyphen
   to en-dash. If you see dash, retype the hyphen manually.

5. **Slowly mode on Devpost title field**: paste the title one character at a
   time, ~100ms between characters. React-based forms sometimes drop
   characters on fast paste.
   See `[[reference_hackathon_submission_workflow_2026-05-30]]`.

6. (Optional) Upload screenshots - frames are at
   `c:\Users\hokut\Desktop\aegis-splunk\demo\video\out\` (8 PNG, 1920x1080
   each, rendered by `demo/video/render_frames.py`).

7. **Confirm rules-acceptance checkbox is actually checked** (not just
   "the JS bypassed me to the next page"). The Devpost rules checkbox has
   historically been bypassed by a hidden React state - verify by clicking
   it explicitly and watching the DOM update.

8. **Submit for judging**.

Devpost will send a confirmation email. Forward the confirmation to yourself
as proof of submission timestamp.

---

## Hard gate: submit at least 24 hours before deadline

- [ ] Submitted **on or before 2026-06-14 09:00 PDT** (= 2026-06-15 01:00 JST)
- [ ] **NOT** later than 2026-06-15 09:00 PDT (= 2026-06-16 01:00 JST) hard
      deadline

Devpost allows edits after submission up until the deadline, so submitting
early is strictly better than submitting late. Use the 24h buffer to:
- Re-watch the linked YouTube video as a logged-out user (confirm Unlisted
  actually allows view, doesn't redirect to "Private video")
- Open the Devpost submission page as a logged-out user (confirm the public
  project page renders)
- Have one friend / sanity-check reader verify the description copy

---

## After submit

- Judging window: 2026-06-15 onwards
- Confirmation email arrives within 5 minutes - if not, check Devpost
  dashboard at <https://devpost.com/submissions>
- The submission is editable until the deadline. If you find a typo or want
  to swap the video URL, you can edit in place

---

## Failure modes to know about (mostly already mitigated)

| Risk | Likelihood | Mitigation in place |
|---|---|---|
| YouTube upload fails partway | low | Try Chrome (not Edge), or split if file > 100 MB (it won't be - target 5-10 MB) |
| Devpost form loses state mid-fill | medium | All long fields live in `docs/DEVPOST_SUBMISSION.md`; can re-paste any time |
| Tagline > 200 chars | n/a | Current tagline is 196 chars |
| Description > Devpost limit | n/a | ~9 KB markdown, well under any platform limit |
| Forgot to set Unlisted | low | Switch in YouTube Studio -> Visibility, instant effect |
| Demo video link 404 in judges' view | very low | Unlisted != private; anyone with link can view |
| Em-dash rejected in title | medium | Title uses hyphen-only; verify char-by-char |
| Rules checkbox JS bypass | medium | Explicitly click + verify DOM update before submit |
| Title field swallows characters | medium | Paste slowly (~100ms per char) into title field |
| No live Splunk before 2026-06-12 | medium | Use `demo/video/SYNTHETIC_FALLBACK.md` Plan B |
| Real JWT in .env.local accidentally pushed | high impact | `.gitignore` blocks; verify with `git ls-files \| grep env` before push |
