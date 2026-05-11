#!/usr/bin/env python3
"""Small local sanity checks for the static exoplanet site."""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def check_json() -> None:
    payload = json.loads((ROOT / "data" / "exoplanets.json").read_text(encoding="utf-8"))
    planets = payload.get("planets", payload)
    if not isinstance(planets, list) or not planets:
        raise AssertionError("data/exoplanets.json must contain a non-empty planets list")
    missing_names = [idx for idx, planet in enumerate(planets) if not planet.get("name")]
    if missing_names:
        raise AssertionError(f"Planet records missing names at indexes: {missing_names[:10]}")
    print(f"JSON OK: {len(planets)} planet records")


def check_javascript() -> None:
    app = ROOT / "assets" / "js" / "app.js"
    try:
        subprocess.run(["node", "--check", str(app)], check=True)
    except FileNotFoundError:
        print("Node.js not found; skipped JavaScript syntax check")
    else:
        print("JavaScript syntax OK")


def check_python() -> None:
    for script_name in ["fetch_exoplanets.py", "generate_science_plots.py"]:
        script = ROOT / "scripts" / script_name
        subprocess.run([sys.executable, "-m", "py_compile", str(script)], check=True)
    print("Python syntax OK")


def check_plot_manifest() -> None:
    manifest_path = ROOT / "assets" / "plots" / "manifest.json"
    if not manifest_path.exists():
        raise AssertionError("assets/plots/manifest.json is missing; run scripts/generate_science_plots.py")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    target_plots = manifest.get("target_plots", {})
    if not target_plots:
        raise AssertionError("plot manifest contains no target plots")
    missing = []
    for plots in target_plots.values():
        for rel_path in plots.values():
            local = ROOT / rel_path.replace("./", "", 1)
            if not local.exists():
                missing.append(rel_path)
    if missing:
        raise AssertionError(f"plot manifest points to missing files: {missing[:5]}")
    print(f"Plot manifest OK: {len(target_plots)} target plot packs")


def main() -> int:
    check_json()
    check_javascript()
    check_python()
    check_plot_manifest()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
