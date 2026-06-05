"""Compose dashboard background + 9 lower-third overlays into scene PNGs,
then drive ffmpeg to assemble the timed ~2:40 slideshow MP4 with narration.

Output: demo/video/aegis-splunk-demo-v3.mp4 (1920x1080, h.264+aac, ~160s).
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
VIDEO_DIR = ROOT / "demo" / "video"
OUT_DIR = VIDEO_DIR / "out"
SCENES_DIR = VIDEO_DIR / "scenes"
SCENES_DIR.mkdir(exist_ok=True)

DASHBOARD = VIDEO_DIR / "dashboard-bg.png"
TITLE = OUT_DIR / "01_title.png"
CLOSING = OUT_DIR / "11_closing.png"
NARRATION = VIDEO_DIR / "narration.wav"

LOWER_THIRDS = [
    OUT_DIR / "02_lower_mcp_tool.png",
    OUT_DIR / "03_lower_chaos.png",
    OUT_DIR / "04_lower_l4.png",
    OUT_DIR / "05_lower_hedge.png",
    OUT_DIR / "06_lower_mcp_shim.png",
    OUT_DIR / "07_lower_trust_degraded.png",
    OUT_DIR / "08_lower_hec.png",
    OUT_DIR / "09_lower_mttr.png",
    OUT_DIR / "10_lower_trust_trusted.png",
]

# Compose dashboard + each lower-third into individual scene PNGs.
print("[compose] generating scene composites...")
bg = Image.open(DASHBOARD).convert("RGBA")
scene_paths = []
for i, lt_path in enumerate(LOWER_THIRDS, start=1):
    overlay = Image.open(lt_path).convert("RGBA")
    composite = bg.copy()
    composite.paste(overlay, (0, 960), overlay)
    out = SCENES_DIR / f"scene_{i:02d}_with_lt.png"
    composite.convert("RGB").save(out, optimize=True)
    scene_paths.append(out)
    print(f"  -> {out.name}")

plain_scene = SCENES_DIR / "scene_00_plain.png"
bg.convert("RGB").save(plain_scene, optimize=True)

# Frame timing aligned to narration.wav segment boundaries (~155s of audio).
# Total video: 5 + 8 + 9*15 + 12 = 160s
concat_lines = []
durations = [
    (TITLE, 5.0),        # lead silence + "P1 incident response 02:14 AM"
    (plain_scene, 8.0),  # SOC analyst goes dark intro
] + [(p, 15.0) for p in scene_paths] + [  # 9 overlays × 15s
    (CLOSING, 12.0),     # closing card + trail silence
]
concat_path = SCENES_DIR / "concat.txt"
with concat_path.open("w") as f:
    for path, dur in durations:
        p = str(path.resolve()).replace("\\", "/")
        f.write(f"file '{p}'\nduration {dur}\n")
    p = str(durations[-1][0].resolve()).replace("\\", "/")
    f.write(f"file '{p}'\n")

total_s = sum(d for _, d in durations)
print(f"[concat] wrote {concat_path}  (total: {total_s:.0f}s = {total_s//60:.0f}:{total_s%60:02.0f})")

# Step 1: assemble silent video from frames
silent_mp4 = VIDEO_DIR / "_silent.mp4"
cmd_video = [
    "ffmpeg", "-y",
    "-f", "concat", "-safe", "0", "-i", str(concat_path),
    "-fps_mode", "cfr", "-r", "30",
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    str(silent_mp4),
]
print(f"[ffmpeg video] assembling frames...")
r = subprocess.run(cmd_video, capture_output=True, text=True)
if r.returncode != 0:
    print("STDERR:", r.stderr[-2000:])
    sys.exit(r.returncode)

# Step 2: merge with narration.wav (if available)
out_mp4 = VIDEO_DIR / "aegis-splunk-demo-v3.mp4"
if NARRATION.exists():
    cmd_merge = [
        "ffmpeg", "-y",
        "-i", str(silent_mp4),
        "-i", str(NARRATION),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        str(out_mp4),
    ]
    print(f"[ffmpeg merge] adding narration audio...")
    r2 = subprocess.run(cmd_merge, capture_output=True, text=True)
    if r2.returncode != 0:
        print("STDERR:", r2.stderr[-2000:])
        print("[warn] audio merge failed — using silent video")
        shutil.copy(silent_mp4, out_mp4)
    else:
        silent_mp4.unlink(missing_ok=True)
else:
    print("[warn] narration.wav not found — producing silent video")
    shutil.copy(silent_mp4, out_mp4)
    silent_mp4.unlink(missing_ok=True)

print(f"\n[done] {out_mp4}")
size_mb = out_mp4.stat().st_size / 1024 / 1024
print(f"  size: {size_mb:.1f} MB")

probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_format", "-show_streams", str(out_mp4)],
    capture_output=True, text=True,
)
for line in probe.stdout.splitlines():
    if line.startswith(("duration=", "width=", "height=", "codec_name=", "r_frame_rate=")):
        print(f"  {line}")
