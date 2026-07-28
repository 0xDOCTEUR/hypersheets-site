#!/usr/bin/env python3
"""Update Hypersheets Trade XYZ leaderboard.json from Hydromancer, then optionally copy into deploy.

Usage:
  py update_hypersignal_leaderboard.py
  py update_hypersignal_leaderboard.py --push-if-ok
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


DOWNLOADS = Path(r"C:\Users\Monsi\Downloads")
BUILD_SCRIPT = DOWNLOADS / "build_leaderboard_from_hydromancer.py"
OUT_JSON = DOWNLOADS / "leaderboard.json"
DEPLOY_JSON = Path(r"C:\Users\Monsi\Downloads\Screenshots\hypersheets-deploy\leaderboard.json")
DEPLOY_DIR = DEPLOY_JSON.parent


def run_build() -> dict:
    if not BUILD_SCRIPT.exists():
        raise SystemExit(f"Missing build script: {BUILD_SCRIPT}")
    cmd = [
        sys.executable,
        str(BUILD_SCRIPT),
        "--s3",
        "--by-day",
        "-o",
        str(OUT_JSON),
    ]
    print("[update] ", " ".join(cmd), flush=True)
    subprocess.check_call(cmd)
    payload = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    return payload


def ok_to_publish(payload: dict) -> bool:
    skipped = payload.get("skipped_days") or []
    count = int(payload.get("count") or 0)
    days = int(payload.get("days_processed") or 0)
    if skipped:
        print(f"[update] NOT OK — skipped_days={len(skipped)} (refuse publish)", flush=True)
        return False
    if count < 1000:
        print(f"[update] NOT OK — count too small ({count})", flush=True)
        return False
    if days < 30:
        print(f"[update] NOT OK — days_processed too small ({days})", flush=True)
        return False
    print(f"[update] OK — count={count} days={days} skipped=0", flush=True)
    return True


def copy_to_deploy() -> None:
    DEPLOY_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT_JSON, DEPLOY_JSON)
    print(f"[update] copied → {DEPLOY_JSON}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--push-if-ok",
        action="store_true",
        help="Copy into hypersheets-deploy when skipped_days is empty (no git push)",
    )
    ap.add_argument(
        "--start",
        default=None,
        help="Optional start date forwarded to builder",
    )
    ap.add_argument(
        "--end",
        default=None,
        help="Optional end date forwarded to builder",
    )
    args = ap.parse_args()

    # Rebuild (forward optional date window by rewriting argv for builder via env-less call)
    if args.start or args.end:
        cmd = [
            sys.executable,
            str(BUILD_SCRIPT),
            "--s3",
            "--by-day",
            "-o",
            str(OUT_JSON),
        ]
        if args.start:
            cmd += ["--start", args.start]
        if args.end:
            cmd += ["--end", args.end]
        print("[update] ", " ".join(cmd), flush=True)
        subprocess.check_call(cmd)
        payload = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    else:
        payload = run_build()

    if args.push_if_ok:
        if not ok_to_publish(payload):
            return 1
        copy_to_deploy()
        print("[update] ready for git commit/push of leaderboard.json", flush=True)
    else:
        print(f"[update] local file ready: {OUT_JSON}", flush=True)
        print("[update] import via Hypersheets Leaderboard → « Importer le nouveau classement »", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
