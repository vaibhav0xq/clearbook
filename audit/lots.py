"""Independent decimal lot replay for Clearbook ledger events."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable


ZERO = Decimal("0")
CENT = Decimal("0.01")
INFLOWS = {"buy", "transfer_in", "wrapper_swap_in"}
OUTFLOWS = {"sell", "transfer_out", "wrapper_swap_out"}


def decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def instant(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def is_long_term(opened: datetime, closed: datetime) -> bool:
    year = opened.year + 1
    month = opened.month
    day = opened.day
    if month == 2 and day == 29:
        try:
            anniversary = opened.replace(year=year)
        except ValueError:
            anniversary = opened.replace(year=year, day=28)
    else:
        anniversary = opened.replace(year=year)
    sold_day = closed.astimezone(timezone.utc).date()
    return sold_day > anniversary.astimezone(timezone.utc).date()


@dataclass
class Lot:
    id: str
    mint: str
    symbol: str
    opened_at: datetime
    kind: str
    quantity: Decimal
    remaining: Decimal
    cost: Decimal | None
    multiplier_at_open: Decimal | None
    basis_status: str
    closed_at: datetime | None = None

    @property
    def remaining_cost(self) -> Decimal | None:
        if self.cost is None:
            return None
        return self.cost * self.remaining / self.quantity


@dataclass
class ClosedLot:
    disposal_id: str
    lot_id: str
    mint: str
    symbol: str
    opened_at: datetime | None
    closed_at: datetime
    quantity: Decimal | None
    proceeds: Decimal | None
    cost: Decimal | None
    gain: Decimal | None
    term: str


@dataclass
class Replay:
    lots: list[Lot]
    closed: list[ClosedLot]

    def open_lots(self, multipliers: dict[str, Decimal] | None = None) -> list[dict[str, Any]]:
        current = multipliers or {}
        rows = []
        for lot in self.lots:
            if lot.remaining <= ZERO:
                continue
            multiplier = current.get(lot.mint)
            rows.append(
                {
                    "id": lot.id,
                    "mint": lot.mint,
                    "symbol": lot.symbol,
                    "quantity": None if multiplier is None else lot.remaining * multiplier,
                    "cost": lot.remaining_cost,
                }
            )
        return rows


def _event_quantity(event: dict[str, Any]) -> Decimal:
    if "rawDelta" in event:
        raw = decimal(event["rawDelta"]) or ZERO
        decimals = int(event.get("decimals", 0))
        return raw / (Decimal(10) ** decimals)
    return decimal(event.get("rawQuantity")) or ZERO


def _event_multiplier(event: dict[str, Any]) -> Decimal | None:
    return decimal(event.get("multiplierAtEvent"))


def _sort_key(event: dict[str, Any]) -> tuple[Any, ...]:
    kind = event.get("kind", "unknown")
    return (
        instant(event["blockTime"]),
        event.get("slot") or 0,
        0 if kind in OUTFLOWS else 1,
        str(event["id"]),
    )


def replay(events: Iterable[dict[str, Any]], method: str = "fifo") -> Replay:
    if method not in {"fifo", "lifo", "hifo"}:
        raise ValueError(f"Unsupported method: {method}")
    lots: list[Lot] = []
    closed: list[ClosedLot] = []

    for event in sorted(events, key=_sort_key):
        kind = event.get("kind", "unknown")
        quantity = _event_quantity(event)
        multiplier = _event_multiplier(event)
        mint = str(event["mint"])
        symbol = str(event.get("symbol") or mint[:6])
        at = instant(event["blockTime"])
        gross = decimal(event.get("grossUsd", event.get("grossAmount")))
        fee = decimal(event.get("feeUsd", event.get("fee"))) or ZERO

        if kind in INFLOWS and quantity > ZERO:
            cost = None
            status = "unknown"
            lot_kind = "buy"
            if kind == "buy" and gross is not None:
                cost = gross + fee
                status = "complete"
            elif kind == "transfer_in":
                lot_kind = "transfer_in"
                reference = decimal(event.get("referencePriceUsd"))
                if reference is not None and multiplier is not None:
                    cost = reference * quantity * multiplier
                    status = "estimated"
            elif kind == "wrapper_swap_in":
                lot_kind = "wrapper_swap"
                if gross is not None:
                    cost = gross
                    status = "complete"
            lots.append(
                Lot(
                    str(event["id"]),
                    mint,
                    symbol,
                    at,
                    lot_kind,
                    quantity,
                    quantity,
                    cost,
                    multiplier,
                    status,
                )
            )
            continue

        if kind not in OUTFLOWS or quantity >= ZERO:
            continue

        needed = -quantity
        candidates = [lot for lot in lots if lot.mint == mint and lot.remaining > ZERO]
        available = sum((lot.remaining for lot in candidates), ZERO)
        if available < needed:
            shortfall = needed - available
            opening = Lot(
                f"{event['id']}:opening",
                mint,
                symbol,
                at,
                "opening_balance",
                shortfall,
                shortfall,
                None,
                None,
                "unknown",
            )
            lots.append(opening)
            candidates.append(opening)

        if method == "fifo":
            candidates.sort(key=lambda lot: (lot.opened_at, lot.id))
        elif method == "lifo":
            candidates.sort(key=lambda lot: lot.id)
            candidates.sort(key=lambda lot: lot.opened_at, reverse=True)
        else:
            candidates.sort(
                key=lambda lot: (
                    -(lot.cost / lot.quantity if lot.cost is not None else Decimal("-1")),
                    lot.opened_at,
                    lot.id,
                )
            )

        total = needed
        proceeds_total = None if kind == "transfer_out" or gross is None else gross - fee
        disposal_rows: list[ClosedLot] = []
        for lot in candidates:
            if needed == ZERO:
                break
            take = min(lot.remaining, needed)
            cost = None if lot.cost is None else lot.cost * take / lot.quantity
            proceeds = None if proceeds_total is None else proceeds_total * take / total
            gain = None if cost is None or proceeds is None else proceeds - cost
            lot.remaining -= take
            needed -= take
            if lot.remaining == ZERO:
                lot.closed_at = at
            if kind != "transfer_out":
                disposal_rows.append(
                    ClosedLot(
                        str(event["id"]),
                        lot.id,
                        mint,
                        symbol,
                        None if lot.kind == "opening_balance" else lot.opened_at,
                        at,
                        None if multiplier is None else take * multiplier,
                        None if proceeds is None else money(proceeds),
                        None if cost is None else money(cost),
                        None,
                        "unknown" if lot.kind == "opening_balance" else ("long" if is_long_term(lot.opened_at, at) else "short"),
                    )
                )

        if proceeds_total is not None and disposal_rows:
            target = money(proceeds_total)
            listed = sum((row.proceeds or ZERO for row in disposal_rows), ZERO)
            disposal_rows[-1].proceeds = (disposal_rows[-1].proceeds or ZERO) + target - listed
        for row in disposal_rows:
            if row.proceeds is not None and row.cost is not None:
                row.gain = money(row.proceeds - row.cost)
        closed.extend(disposal_rows)

    return Replay(lots, closed)


def current_multipliers(corporate_events: Iterable[dict[str, Any]]) -> dict[str, Decimal]:
    latest: dict[str, tuple[datetime, Decimal]] = {}
    for event in corporate_events:
        if event.get("kind") in {"pending_multiplier", "multiplier_pending"}:
            continue
        value = decimal(event.get("newMultiplier"))
        at_value = event.get("effectiveAt") or event.get("detectedAt")
        if value is None or not at_value:
            continue
        at = instant(at_value)
        mint = str(event["mint"])
        if mint not in latest or at > latest[mint][0]:
            latest[mint] = (at, value)
    return {mint: value for mint, (_, value) in latest.items()}


def multiplier_at(
    mint: str,
    at: datetime,
    corporate_events: Iterable[dict[str, Any]],
    current: dict[str, Decimal],
) -> Decimal | None:
    changes = []
    for event in corporate_events:
        if str(event.get("mint")) != mint:
            continue
        if event.get("kind") in {"pending_multiplier", "multiplier_pending"}:
            continue
        effective = event.get("effectiveAt") or event.get("detectedAt")
        previous = decimal(event.get("previousMultiplier"))
        new = decimal(event.get("newMultiplier"))
        if effective and previous is not None and new is not None:
            changes.append((instant(effective), previous, new))
    changes.sort(key=lambda item: item[0])
    if not changes:
        return current.get(mint)
    value = changes[0][1]
    for effective, _, new in changes:
        if effective > at:
            break
        value = new
    return value