"""Command line cross check for the Clearbook lot engine."""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal
from pathlib import Path
from typing import Any

from lots import current_multipliers, decimal, instant, multiplier_at, replay


TOLERANCE = Decimal("0.005")


class InputError(Exception):
    pass


def request(url: str, viewer: str | None) -> urllib.request.Request:
    headers = {"x-clearbook-viewer": viewer} if viewer else {}
    return urllib.request.Request(url, headers=headers)


def fetch_json(url: str, viewer: str | None = None) -> Any:
    try:
        with urllib.request.urlopen(request(url, viewer), timeout=30) as response:
            return json.load(response)
    except (OSError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        raise InputError(f"Could not read {url}: {exc}") from exc


def fetch_text(url: str, viewer: str | None = None) -> str:
    try:
        with urllib.request.urlopen(request(url, viewer), timeout=30) as response:
            return response.read().decode("utf-8")
    except (OSError, urllib.error.HTTPError, UnicodeError) as exc:
        raise InputError(f"Could not read {url}: {exc}") from exc


def load_json(path: str) -> Any:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise InputError(f"Could not read {path}: {exc}") from exc


def endpoint(base: str, wallet: str, suffix: str, **query: Any) -> str:
    root = base.rstrip("/")
    address = urllib.parse.quote(wallet, safe="")
    url = f"{root}/wallets/{address}/{suffix}"
    values = {key: value for key, value in query.items() if value is not None}
    return url + (f"?{urllib.parse.urlencode(values)}" if values else "")


def tax_rows_from_csv(text: str) -> list[dict[str, Any]]:
    rows = list(csv.reader(io.StringIO(text)))
    try:
        marker = next(index for index, row in enumerate(rows) if row == ["Lots"])
    except StopIteration as exc:
        raise InputError("Tax lot CSV has no Lots section.") from exc
    if marker + 1 >= len(rows):
        return []
    headers = rows[marker + 1]
    return [dict(zip(headers, row)) for row in rows[marker + 2 :] if row]


def normalize_events(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        return data["items"]
    if isinstance(data, list):
        return data
    raise InputError("Events JSON must be an array or an activity page.")


def close_enough(left: Any, right: Any) -> bool:
    if left is None or right in (None, "", "Unknown"):
        return left is None and right in (None, "", "Unknown")
    return abs((decimal(left) or Decimal(0)) - (decimal(right) or Decimal(0))) <= TOLERANCE


def compare_open(expected: list[dict[str, Any]], actual: list[dict[str, Any]]) -> tuple[int, list[str], list[str]]:
    reported = {str(row["id"]): row for row in actual if row.get("status") != "closed"}
    differences: list[str] = []
    notices: list[str] = []
    for row in expected:
        found = reported.pop(row["id"], None)
        if found is None:
            differences.append(f"Open lot {row['id']} is missing.")
            continue
        if str(found.get("mint")) != row["mint"] or str(found.get("symbol")) != row["symbol"]:
            differences.append(f"Open lot {row['id']} has a different asset.")
        for label, local, remote in (
            ("quantity", row["quantity"], found.get("remainingQuantity", found.get("quantity"))),
            ("cost", row["cost"], found.get("remainingCostBasis", found.get("costBasis"))),
        ):
            if label == "quantity" and local is None:
                notices.append(f"Open lot {row['id']} quantity was not checked because no reported multiplier was available.")
                continue
            if not close_enough(local, remote):
                differences.append(f"Open lot {row['id']} {label}: replay {local} app {remote}.")
    for lot_id in reported:
        differences.append(f"Open lot {lot_id} is only in the app.")
    return len(expected), differences, notices


def normalized_saved_tax(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("rows"), list):
        return data["rows"]
    raise InputError("Tax lots JSON must contain row details.")


def compare_closed(expected: list[Any], actual: list[dict[str, Any]]) -> tuple[int, list[str], list[str]]:
    def value(row: dict[str, Any], *names: str) -> Any:
        for name in names:
            if name in row:
                return row[name]
        return None

    reported = {
        (str(value(row, "Disposal id", "disposalId")), str(value(row, "Lot id", "lotId"))): row
        for row in actual
    }
    differences: list[str] = []
    notices: list[str] = []
    for row in expected:
        key = (row.disposal_id, row.lot_id)
        found = reported.pop(key, None)
        if found is None:
            differences.append(f"Closed lot {key[0]} and {key[1]} is missing.")
            continue
        checks = (
            ("asset mint", row.mint, value(found, "Mint", "mint")),
            ("asset symbol", row.symbol, value(found, "Symbol", "symbol")),
            ("opened", None if row.opened_at is None else row.opened_at.date().isoformat(), value(found, "Date acquired (1b)", "acquiredAt")),
            ("closed", row.closed_at.date().isoformat(), value(found, "Date sold (1c)", "soldAt")),
            ("quantity", row.quantity, value(found, "Quantity", "quantity")),
            ("proceeds", row.proceeds, value(found, "Proceeds (1d)", "proceeds")),
            ("cost", row.cost, value(found, "Cost or other basis (1e)", "costBasis")),
            ("gain", row.gain, value(found, "Gain or loss", "gainLoss")),
            ("term", row.term, value(found, "Term", "term")),
        )
        for label, local, remote in checks:
            if label in {"quantity", "proceeds", "cost", "gain"}:
                if label == "quantity" and local is None:
                    notices.append(f"Closed lot {key[0]} and {key[1]} quantity was not checked because no reported multiplier was available.")
                    continue
                same = close_enough(local, remote)
            elif label == "opened" and local is None:
                same = remote in (None, "", "Unknown")
            elif label in {"opened", "closed"} and remote:
                same = local == instant(str(remote)).date().isoformat()
            elif label == "term":
                same = str(remote).lower().replace(" term", "") == str(local).lower()
            else:
                same = str(local) == str(remote)
            if not same:
                differences.append(f"Closed lot {key[0]} and {key[1]} {label}: replay {local} app {remote}.")
    for disposal_id, lot_id in reported:
        differences.append(f"Closed lot {disposal_id} and {lot_id} is only in the app.")
    return len(expected), differences, notices


def fetch_activity(base: str, wallet: str, method: str, viewer: str | None) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    cursor = None
    seen = set()
    total = None
    while True:
        page = fetch_json(endpoint(base, wallet, "activity", method=method, limit=500, cursor=cursor), viewer)
        if not isinstance(page, dict) or not isinstance(page.get("items"), list) or not isinstance(page.get("total"), int):
            raise InputError("Activity response cannot prove that history is complete.")
        if total is None:
            total = page["total"]
        elif page["total"] != total:
            raise InputError("Activity total changed while pages were read.")
        items.extend(page["items"])
        next_cursor = page.get("nextCursor")
        if not next_cursor:
            break
        if next_cursor in seen:
            raise InputError("Activity pagination repeated a cursor.")
        seen.add(next_cursor)
        cursor = next_cursor
    if len(items) != total:
        raise InputError(f"Activity history is incomplete. Read {len(items)} of {total} rows.")
    ids = [str(item.get("id")) for item in items]
    if len(set(ids)) != len(ids):
        raise InputError("Activity history contains duplicate rows across pages.")
    return {"items": items, "total": total, "nextCursor": None}


def api_inputs(
    base: str,
    wallet: str,
    method: str,
    year: int | None,
    viewer: str | None,
) -> tuple[Any, Any, list[dict[str, Any]], dict[str, Decimal]]:
    activity = fetch_activity(base, wallet, method, viewer)
    lots = fetch_json(endpoint(base, wallet, "lots", method=method), viewer)
    actions = fetch_json(endpoint(base, wallet, "events"), viewer)
    portfolio = fetch_json(endpoint(base, wallet, "portfolio", method=method), viewer)
    report = fetch_json(endpoint(base, wallet, "tax-lots", method=method), viewer)
    portfolio_multipliers = {}
    for position in portfolio.get("positions", []):
        info = position.get("multiplier") or {}
        value = decimal(info.get("current"))
        if value is not None:
            portfolio_multipliers[str(position["mint"])] = value
    current = current_multipliers(actions)
    current.update(portfolio_multipliers)
    for event in activity["items"]:
        value = multiplier_at(str(event["mint"]), instant(event["blockTime"]), actions, current)
        if value is not None:
            event["multiplierAtEvent"] = str(value)
    years = [year] if year is not None else [item["year"] for item in report.get("years", [])]
    tax_rows: list[dict[str, Any]] = []
    for tax_year in years:
        text = fetch_text(endpoint(base, wallet, "tax-lots/export.csv", method=method, year=tax_year), viewer)
        tax_rows.extend(tax_rows_from_csv(text))
    return activity, lots, tax_rows, current


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cross check Clearbook tax lots.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--api")
    source.add_argument("--events")
    parser.add_argument("--wallet")
    parser.add_argument("--lots")
    parser.add_argument("--tax-lots")
    parser.add_argument("--method", choices=["fifo", "lifo", "hifo"])
    parser.add_argument("--tax-year", type=int)
    parser.add_argument("--viewer")
    args = parser.parse_args(argv)

    if args.api and not args.wallet:
        raise InputError("--wallet is required with --api.")
    if args.events and not (args.lots or args.tax_lots):
        raise InputError("--events requires --lots or --tax-lots.")

    methods = [args.method] if args.method else ["fifo", "lifo", "hifo"]
    any_difference = False
    saved_events = load_json(args.events) if args.events else None
    for method in methods:
        if args.api:
            event_data, lot_data, tax_data, multipliers = api_inputs(
                args.api, args.wallet, method, args.tax_year, args.viewer
            )
        else:
            event_data = saved_events
            lot_data = load_json(args.lots) if args.lots else []
            tax_data = normalized_saved_tax(load_json(args.tax_lots)) if args.tax_lots else []
            multipliers = {}
        result = replay(normalize_events(event_data), method)
        if args.tax_year is not None:
            result.closed = [row for row in result.closed if row.closed_at.year == args.tax_year]
        open_count, open_differences, open_notices = compare_open(result.open_lots(multipliers), lot_data) if args.lots or args.api else (0, [], [])
        closed_count, closed_differences, closed_notices = compare_closed(result.closed, tax_data) if args.tax_lots or args.api else (0, [], [])
        differences = open_differences + closed_differences
        print(f"{method}: {open_count} open lots and {closed_count} closed lots compared.")
        for notice in open_notices + closed_notices:
            print(f"  {notice}")
        for difference in differences:
            print(f"  {difference}")
        if differences:
            any_difference = True
    return 1 if any_difference else 0


def main() -> None:
    try:
        raise SystemExit(run())
    except InputError as exc:
        print(f"Input error: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()