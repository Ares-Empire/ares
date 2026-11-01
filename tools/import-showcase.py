#!/usr/bin/env python3
"""Copies the app pictures the apps page uses from empire-ios's showcase into static/img/apps/, sized for the web.

    python3 tools/import-showcase.py [path to empire-ios]      (default: ../empire-ios)

The showcase (empire-ios/showcase/<app>/NN-name.png, made by its scripts/showcase.py: each screen in a drawn
iPhone, sample data only) stays the source. This takes the shots content/apps.json names under "shots", scales
them to 440 px wide (the page shows them at up to 228 px, sharp on 2x screens) and saves them as WebP with their transparent
background, plus static/img/apps/SOURCE with the empire-ios commit they came from. Run it again after the
showcase is re-shot, then build. Needs Pillow.
"""

import json
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is missing: python3 -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 440


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "empire-ios"
    showcase = source / "showcase"
    if not showcase.is_dir():
        print(f"no showcase/ in {source}", file=sys.stderr)
        return 1
    apps = json.loads((ROOT / "content" / "apps.json").read_text(encoding="utf-8"))["apps"]
    out_root = ROOT / "static" / "img" / "apps"
    written = 0
    for app in apps:
        names = sorted({name for pair in (app.get("shots") or {}).values() for name in pair})
        out = out_root / app["id"]
        if out.exists():
            for old in out.glob("*.webp"):
                if old.stem not in names:
                    old.unlink()
        for name in names:
            src = showcase / app["id"] / f"{name}.png"
            if not src.exists():
                print(f"missing: {src}", file=sys.stderr)
                return 1
            im = Image.open(src).convert("RGBA")
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
            out.mkdir(parents=True, exist_ok=True)
            im.save(out / f"{name}.webp", "WEBP", quality=84, method=6)
            written += 1
    commit = subprocess.run(["git", "-C", str(source), "rev-parse", "--short", "HEAD"],
                            capture_output=True, text=True).stdout.strip() or "unknown"
    (out_root / "SOURCE").write_text(f"empire-ios showcase/ at commit {commit}, imported by tools/import-showcase.py\n",
                                     encoding="utf-8")
    print(f"{written} pictures from empire-ios {commit}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
