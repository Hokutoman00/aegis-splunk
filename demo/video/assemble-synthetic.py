"""Compose dashboard background + 6 lower-third overlays into 6 scene PNGs,
then drive ffmpeg to assemble the timed slideshow MP4.

No live OBS recording; uses the live Splunk dashboard screenshot as the
"live" backdrop. This is the Plan-B-on-steroids path: the synthetic part is
that no narration / cursor / typing is shown, but every panel value is
real data the live Splunk instance computed from real HEC events.

Output: demo/video/aegis-splunk-demo.mp4 (1920x1080, h.264, ~60s, silent).
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
CLOSING = OUT_DIR / "08_closing.png"
LOWER_THIRDS = [
    OUT_DIR / "02_lower_mcp_tool.png",
    OUT_DIR / "03_lower_chaos.png",
    OUT_DIR / "04_lower_hedge.png",
    OUT_DIR / "05_lower_mcp_shim.png",
    OUT_DIR / "06_lower_hec.png",
    OUT_DIR / "07_lower_mttr.png",
]

# Compose dashboard + each lower-third into individual scene PNGs.
print("[compose] generating scene composites...")
bg = Image.open(DASHBOARD).convert("RGBA")
scene_paths = []
for i, lt_path in enumerate(LOWER_THIRDS, start=1):
    overlay = Image.open(lt_path).convert("RGBA")
    composite = bg.copy()
    # Lower-third lives at y = 1080 - 120 = 960
    composite.paste(overlay, (0, 960), overlay)
    out = SCENES_DIR / f"scene_{i:02d}_with_lt.png"
    composite.convert("RGB").save(out, optimize=True)
    scene_paths.append(out)
    print(f"  -> {out.name}")

# Plain-dashboard scene (no overlay) for the opening live segment.
plain_scene = SCENES_DIR / "scene_00_plain.png"
bg.convert("RGB").save(plain_scene, optimize=True)

# Build concat demuxer file: title (3s) → plain (3s) → 6 lower-third (each 4s) → closing (5s)
# Total: 3 + 3 + 24 + 5 = 35s
concat_lines = []
durations = [
    (TITLE, 3.0),
    (plain_scene, 3.0),
] + [(p, 4.0) for p in scene_paths] + [
    (CLOSING, 5.0),
]
concat_path = SCENES_DIR / "concat.txt"
with concat_path.open("w") as f:
    for path, dur in durations:
        # concat demuxer requires forward slashes on Windows
        p = str(path.resolve()).replace("\\", "/")
        f.write(f"file '{p}'\nduration {dur}\n")
    # Last frame must be listed twice without duration for concat demuxer
    p = str(durations[-1][0].resolve()).replace("\\", "/")
    f.write(f"file '{p}'\n")

print(f"[concat] wrote {concat_path}")

# ffmpeg assemble
out_mp4 = VIDEO_DIR / "aegis-splunk-demo.mp4"
cmd = [
    "ffmpeg", "-y",
    "-f", "concat", "-safe", "0", "-i", str(concat_path),
    "-fps_mode", "cfr", "-r", "30",
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    str(out_mp4),
]
print(f"[ffmpeg] {' '.join(cmd)}")
result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print("STDERR:", result.stderr[-2000:])
    sys.exit(result.returncode)

print(f"\n[done] {out_mp4}")
size_mb = out_mp4.stat().st_size / 1024 / 1024
print(f"  size: {size_mb:.1f} MB")

# Probe with ffprobe for verification
probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_format", "-show_streams", str(out_mp4)],
    capture_output=True, text=True,
)
for line in probe.stdout.splitlines():
    if line.startswith(("duration=", "width=", "height=", "codec_name=", "r_frame_rate=")):
        print(f"  {line}")
