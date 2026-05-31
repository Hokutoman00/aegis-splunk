"""Render PIL frames for the aegis-splunk demo video.

Usage:
    python demo/video/render_frames.py --out demo/video/out

Produces 8 PNGs:
    01_title.png         — 1920x1080 full-screen title card (T+0:00)
    02_lower_mcp_tool.png — 1920x120 lower-third overlay (T+0:20)
    03_lower_chaos.png    — 1920x120 lower-third overlay, red (T+0:55)
    04_lower_hedge.png    — 1920x120 lower-third overlay, amber (T+1:25)
    05_lower_mcp_shim.png — 1920x120 lower-third overlay, amber (T+1:35)
    06_lower_hec.png      — 1920x120 lower-third overlay, green (T+2:00)
    07_lower_mttr.png     — 1920x120 lower-third overlay, green (T+2:30)
    08_closing.png        — 1920x1080 full-screen close (T+2:50)

Pure PIL, no network, reproducible. Pairs with demo/video/storyboard.md.
"""

from __future__ import annotations
import argparse
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

# Palette (matches reference_hackathon_submission_workflow_2026-05-30 convention).
BG = (16, 18, 22)
FG = (220, 225, 232)
DIM = (140, 150, 165)
ACCENT_BLUE = (66, 153, 225)
ACCENT_AMBER = (245, 158, 11)
ACCENT_RED = (220, 38, 38)
ACCENT_GREEN = (34, 197, 94)

FRAME_W, FRAME_H = 1920, 1080
LOWER_W, LOWER_H = 1920, 120

GITHUB_URL = "github.com/Hokutoman00/aegis-splunk"


def _try_font(size: int) -> ImageFont.FreeTypeFont:
    """Best-effort font lookup. Falls back to PIL default if no TTF on the system."""
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
    ]
    for p in candidates:
        if pathlib.Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _try_mono(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/consola.ttf",
        "/System/Library/Fonts/Menlo.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for p in candidates:
        if pathlib.Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render_title(out: pathlib.Path) -> None:
    img = Image.new("RGB", (FRAME_W, FRAME_H), BG)
    d = ImageDraw.Draw(img)
    f_lg = _try_font(96)
    f_md = _try_font(54)
    f_sm = _try_font(32)
    line1 = "P1 incident response"
    line2 = "02:14 AM"
    sub = "aegis-splunk — resilience layer for Splunk's agentic stack"
    # Center-vertical layout
    w1, _ = d.textbbox((0, 0), line1, font=f_lg)[2:]
    w2, _ = d.textbbox((0, 0), line2, font=f_md)[2:]
    ws, _ = d.textbbox((0, 0), sub, font=f_sm)[2:]
    d.text(((FRAME_W - w1) / 2, 380), line1, font=f_lg, fill=FG)
    d.text(((FRAME_W - w2) / 2, 510), line2, font=f_md, fill=ACCENT_BLUE)
    d.text(((FRAME_W - ws) / 2, 650), sub, font=f_sm, fill=DIM)
    img.save(out / "01_title.png")


def render_lower_third(
    out: pathlib.Path,
    filename: str,
    text: str,
    accent: tuple[int, int, int],
) -> None:
    """Semi-transparent lower-third banner. Composited over live capture in OBS."""
    img = Image.new("RGBA", (LOWER_W, LOWER_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Translucent dark background
    d.rectangle([(0, 0), (LOWER_W, LOWER_H)], fill=(16, 18, 22, 215))
    # Left accent bar
    d.rectangle([(0, 0), (8, LOWER_H)], fill=accent + (255,))
    f = _try_mono(46)
    # Center text vertically
    tb = d.textbbox((0, 0), text, font=f)
    th = tb[3] - tb[1]
    d.text((40, (LOWER_H - th) / 2 - 4), text, font=f, fill=FG + (255,))
    img.save(out / filename)


def render_closing(out: pathlib.Path) -> None:
    img = Image.new("RGB", (FRAME_W, FRAME_H), BG)
    d = ImageDraw.Draw(img)
    f_lg = _try_font(108)
    f_md = _try_font(48)
    f_sm = _try_mono(38)
    name = "aegis-splunk"
    license_line = "MIT licensed · open source"
    repo = GITHUB_URL
    tagline = "Hedge first, fallback second, continuously chaos-verified."
    wn, _ = d.textbbox((0, 0), name, font=f_lg)[2:]
    wl, _ = d.textbbox((0, 0), license_line, font=f_md)[2:]
    wr, _ = d.textbbox((0, 0), repo, font=f_sm)[2:]
    wt, _ = d.textbbox((0, 0), tagline, font=f_md)[2:]
    d.text(((FRAME_W - wn) / 2, 320), name, font=f_lg, fill=ACCENT_BLUE)
    d.text(((FRAME_W - wt) / 2, 470), tagline, font=f_md, fill=FG)
    d.text(((FRAME_W - wl) / 2, 600), license_line, font=f_md, fill=DIM)
    d.text(((FRAME_W - wr) / 2, 700), repo, font=f_sm, fill=ACCENT_AMBER)
    img.save(out / "08_closing.png")


def main() -> int:
    ap = argparse.ArgumentParser(description="Render aegis-splunk demo PNG frames.")
    ap.add_argument("--out", default="demo/video/out",
                    help="Output directory (created if missing).")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    render_title(out)
    render_lower_third(out, "02_lower_mcp_tool.png",
                       "MCP tool: splunk_search · Splunk MCP Server #7931",
                       ACCENT_BLUE)
    render_lower_third(out, "03_lower_chaos.png",
                       "CHAOS: anthropic_429 · CHAOS: splunk_mcp_503",
                       ACCENT_RED)
    render_lower_third(out, "04_lower_hedge.png",
                       "HEDGE -> gpt-oss-120b (Splunk hosted)",
                       ACCENT_AMBER)
    render_lower_third(out, "05_lower_mcp_shim.png",
                       "MCP REST shim engaged -> /services/search/jobs",
                       ACCENT_AMBER)
    render_lower_third(out, "06_lower_hec.png",
                       "HEC sourcetypes: aegis:chaos · aegis:mcp-failover",
                       ACCENT_GREEN)
    render_lower_third(out, "07_lower_mttr.png",
                       "MTTR: 1.8s · Receipt: layers_fired=[L0, L1, L4]",
                       ACCENT_GREEN)
    render_closing(out)

    print(f"Rendered 8 frames to {out}/")
    for p in sorted(out.glob("*.png")):
        print(f"  - {p.name} ({p.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
