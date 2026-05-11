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
    fetcher = ROOT / "scripts" / "fetch_exoplanets.py"
    subprocess.run([sys.executable, "-m", "py_compile", str(fetcher)], check=True)
    print("Python syntax OK")


def main() -> int:
    check_json()
    check_javascript()
    check_python()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
