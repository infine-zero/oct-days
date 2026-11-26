#!/usr/bin/env python3
"""Record earliest verified GitHub Pages deployment completion for public Oct.Days entries."""
import argparse
import json
from datetime import datetime
from pathlib import Path
import re
import subprocess
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "share-data.js"
PROJECT = "https://api.github.com/repos/infine-zero/oct-days"
PAGES = "https://infine-zero.github.io/oct-days/"


def snapshot(text):
    found = re.fullmatch(r"\s*window\.TRAVEL_SHARE\s*=\s*(\{[\s\S]*\})\s*;\s*", text)
    if found is None:
        raise ValueError("Not an Oct.Days public snapshot")
    data = json.loads(found[1])
    if data.get("version") != 1 or not isinstance(data.get("events"), list):
        raise ValueError("Invalid Oct.Days public snapshot")
    return data


def api(path):
    with urlopen(Request(PROJECT + path, headers={"Accept": "application/vnd.github+json"}), timeout=20) as result:
        return json.load(result)


def read_deployment(number):
    dep = api(f"/deployments/{number}")
    if dep["environment"] != "github-pages":
        raise ValueError("Not a Pages deployment")
    statuses = api(f"/deployments/{number}/statuses")
    return [dep["id"], dep["sha"], dep["created_at"],
            [[s["state"], s["created_at"], s.get("environment_url"), s.get("log_url")] for s in statuses]]


def as_instant(value):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value):
        raise ValueError("Not an exact UTC timestamp")
    return datetime.fromisoformat(value[:-1] + "+00:00")


def known_publications(rows):
    earliest = {}
    for deployment, sha, _created, statuses in rows:
        if not re.fullmatch(r"[0-9a-f]{40}", sha) or not isinstance(statuses, list):
            raise ValueError("Deployment evidence is incomplete")
        for state, at, url, _log in statuses:
            if state != "success" or url != PAGES:
                continue
            # Validate and compare actual UTC instants, not Git commit dates.
            instant = as_instant(at)
            text = subprocess.check_output(["git", "show", f"{sha}:share-data.js"], cwd=ROOT, encoding="utf-8")
            for item in snapshot(text)["events"]:
                if item["status"] != "confirmed":
                    continue
                key = item["id"]
                if key not in earliest or instant < earliest[key][0]:
                    earliest[key] = (instant, at, deployment, sha)
    return earliest


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    src = cli.add_mutually_exclusive_group(required=True)
    src.add_argument("--evidence", type=Path, help="Archived public deployment-status rows for a historical backfill")
    src.add_argument("--deployment", type=int, action="append", help="An observed public Pages deployment ID")
    cli.add_argument("--entry", action="append", help="Only fill these public note IDs")
    cli.add_argument("--write", action="store_true", help="Update share-data.js; otherwise just print proposed changes")
    args = cli.parse_args()
    if args.deployment and not args.entry:
        cli.error("--deployment needs --entry for notes newly published in that deployment")
    records = json.loads(args.evidence.read_text(encoding="utf-8")) if args.evidence else [read_deployment(n) for n in args.deployment]
    known = known_publications(records)
    current = snapshot(SNAPSHOT.read_text(encoding="utf-8"))
    missing = set(args.entry or ())
    changed = 0
    for row in current["events"]:
        key = row["id"]
        if args.entry and key not in args.entry:
            continue
        if row["status"] != "confirmed" or key not in known:
            continue
        missing.discard(key)
        if row.get("publishedAt"):
            continue
        _, at, deploy, sha = known[key]
        print(f"{key} {at} Pages deployment {deploy} {sha[:8]}")
        row["publishedAt"] = at
        changed += 1
    if missing:
        cli.error("A requested entry is not confirmed in both the selected Pages evidence and current public data")
    if changed and args.write:
        SNAPSHOT.write_text("window.TRAVEL_SHARE="+json.dumps(current,ensure_ascii=False,indent=2)+";\n",encoding="utf-8")
    print(f"{changed} timestamp(s) {'recorded' if args.write else 'proposed'}")


if __name__ == "__main__":
    main()
