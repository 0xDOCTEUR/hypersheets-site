#!/usr/bin/env python3
"""Build Trade XYZ all-time volume leaderboard from Hydromancer Reservoir (S3).

Reads requester-pays parquet day partitions:
  s3://hydromancer-reservoir/by_dex/xyz/fills/perp/all/date=YYYY-MM-DD/

Output JSON shape matches Hypersheets leaderboard.json.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import boto3
import duckdb


BUCKET = "hydromancer-reservoir"
PREFIX = "by_dex/xyz/fills/perp/all/"
REGION = "ap-northeast-1"
TOP_N = 10000


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def list_fill_dates(s3) -> list[str]:
    dates: list[str] = []
    token = None
    while True:
        kwargs = {
            "Bucket": BUCKET,
            "Prefix": PREFIX,
            "Delimiter": "/",
            "RequestPayer": "requester",
        }
        if token:
            kwargs["ContinuationToken"] = token
        resp = s3.list_objects_v2(**kwargs)
        for cp in resp.get("CommonPrefixes") or []:
            p = cp.get("Prefix") or ""
            # .../date=YYYY-MM-DD/
            if "date=" in p:
                d = p.split("date=", 1)[1].rstrip("/")
                if len(d) == 10:
                    dates.append(d)
        token = resp.get("NextContinuationToken")
        if not token:
            break
    return sorted(set(dates))


def configure_duckdb(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("INSTALL httpfs; LOAD httpfs;")
    # Prefer credential chain (aws configure / env / profile).
    try:
        con.execute(
            f"""
            CREATE OR REPLACE SECRET hydromancer_s3 (
              TYPE S3,
              PROVIDER CREDENTIAL_CHAIN,
              REGION '{REGION}'
            );
            """
        )
    except Exception:
        # Older DuckDB fallback: env vars already used by httpfs if present.
        pass
    try:
        con.execute("SET s3_region = ?", [REGION])
    except Exception:
        pass
    try:
        con.execute("SET s3_requester_pays = true")
    except Exception:
        # Some builds use a different setting name.
        try:
            con.execute("SET s3_url_style = 'path'")
        except Exception:
            pass


def day_aggregate(con: duckdb.DuckDBPyConnection, day: str) -> list[tuple[str, float, int]]:
    # Glob one day partition (may contain multiple parquet files).
    uri = f"s3://{BUCKET}/{PREFIX}date={day}/*.parquet"
    q = f"""
    SELECT
      lower(address) AS trader_address,
      SUM(CAST(price AS DOUBLE) * CAST(size AS DOUBLE)) AS volume_usd,
      COUNT(*)::BIGINT AS nb_trades
    FROM read_parquet('{uri}')
    WHERE address IS NOT NULL AND length(address) = 42
    GROUP BY 1
    """
    return con.execute(q).fetchall()


def build(start: str | None, end: str | None, out_path: Path) -> dict:
    s3 = boto3.client("s3", region_name=REGION)
    print(f"[hydromancer] listing partitions under s3://{BUCKET}/{PREFIX}", flush=True)
    days = list_fill_dates(s3)
    if not days:
        raise SystemExit("No date partitions found — check AWS credentials / RequestPayer access.")

    if start:
        days = [d for d in days if d >= start]
    if end:
        days = [d for d in days if d <= end]

    print(f"[hydromancer] {len(days)} day(s) to process ({days[0]} -> {days[-1]})", flush=True)

    con = duckdb.connect()
    configure_duckdb(con)

    vol: dict[str, float] = defaultdict(float)
    trades: dict[str, int] = defaultdict(int)
    skipped: list[str] = []
    processed = 0

    for i, day in enumerate(days, 1):
        try:
            rows = day_aggregate(con, day)
            for addr, v, n in rows:
                if not addr:
                    continue
                vol[addr] += float(v or 0)
                trades[addr] += int(n or 0)
            processed += 1
            if i == 1 or i % 10 == 0 or i == len(days):
                print(f"  [{i}/{len(days)}] {day} ok (+{len(rows)} wallets, total {len(vol)})", flush=True)
        except Exception as e:
            skipped.append(day)
            print(f"  [{i}/{len(days)}] {day} SKIP: {e}", flush=True)

    ranked = sorted(vol.items(), key=lambda kv: kv[1], reverse=True)[:TOP_N]
    data = [
        {
            "trader_address": addr,
            "total_volume_usd": float(vol[addr]),
            "nb_trades": int(trades[addr]),
        }
        for addr, _ in ranked
    ]
    now = utc_now_iso()
    payload = {
        "data": data,
        "count": len(data),
        "updatedAt": now,
        "queried_at": now,
        "source": "hydromancer-reservoir",
        "days_processed": processed,
        "skipped_days": skipped,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(
        f"[hydromancer] wrote {out_path} — top={len(data)} days={processed} skipped={len(skipped)}",
        flush=True,
    )
    if skipped:
        print(f"[hydromancer] skipped_days={skipped[:20]}{'...' if len(skipped) > 20 else ''}", flush=True)
    return payload


def main() -> int:
    ap = argparse.ArgumentParser(description="Build Hypersheets Trade XYZ leaderboard from Hydromancer S3")
    ap.add_argument("--s3", action="store_true", help="Use S3 Reservoir (default/required)")
    ap.add_argument("--by-day", action="store_true", default=True, help="Aggregate day by day (recommended)")
    ap.add_argument("-o", "--output", default="leaderboard.json", help="Output JSON path")
    ap.add_argument("--start", default=None, help="Start date YYYY-MM-DD (inclusive)")
    ap.add_argument("--end", default=None, help="End date YYYY-MM-DD (inclusive)")
    args = ap.parse_args()
    if not args.s3:
        print("Use --s3 to read Hydromancer Reservoir", file=sys.stderr)
        return 2
    build(args.start, args.end, Path(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
