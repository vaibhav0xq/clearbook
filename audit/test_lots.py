import contextlib
import io
import json
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import audit as audit_cli
from lots import replay


def event(event_id, kind, day, quantity, gross=None, fee=None, multiplier="1", reference=None):
    return {
        "id": event_id,
        "blockTime": f"{day}T12:00:00Z",
        "kind": kind,
        "mint": "mint",
        "symbol": "STK",
        "rawQuantity": quantity,
        "quantity": str(Decimal(str(quantity)) * Decimal(multiplier)),
        "grossAmount": gross,
        "fee": fee,
        "multiplierAtEvent": multiplier,
        "referencePriceUsd": reference,
    }


class LotReplayTests(unittest.TestCase):
    def relief_events(self):
        return [
            event("a", "buy", "2024-01-01", "10", "100"),
            event("b", "buy", "2024-02-01", "10", "300"),
            event("c", "buy", "2024-03-01", "10", "200"),
            event("sale", "sell", "2024-04-01", "-10", "400"),
        ]

    def test_fifo_relief(self):
        result = replay(self.relief_events(), "fifo")
        self.assertEqual(result.closed[0].lot_id, "a")
        self.assertEqual(result.closed[0].gain, Decimal("300.00"))

    def test_lifo_relief(self):
        result = replay(self.relief_events(), "lifo")
        self.assertEqual(result.closed[0].lot_id, "c")
        self.assertEqual(result.closed[0].gain, Decimal("200.00"))

    def test_hifo_relief(self):
        result = replay(self.relief_events(), "hifo")
        self.assertEqual(result.closed[0].lot_id, "b")
        self.assertEqual(result.closed[0].gain, Decimal("100.00"))

    def test_fees_enter_cost_and_reduce_proceeds(self):
        result = replay(
            [
                event("buy", "buy", "2024-01-01", "10", "100", "2"),
                event("sale", "sell", "2024-02-01", "-10", "150", "3"),
            ]
        )
        self.assertEqual(result.closed[0].cost, Decimal("102.00"))
        self.assertEqual(result.closed[0].proceeds, Decimal("147.00"))
        self.assertEqual(result.closed[0].gain, Decimal("45.00"))

    def test_multiplier_grows_shares_without_changing_cost(self):
        result = replay([event("buy", "buy", "2024-01-01", "10", "100")])
        row = result.open_lots({"mint": Decimal("1.2")})[0]
        self.assertEqual(row["quantity"], Decimal("12.0"))
        self.assertEqual(row["cost"], Decimal("100"))

    def test_transfer_with_unknown_basis(self):
        result = replay([event("transfer", "transfer_in", "2024-01-01", "5")])
        row = result.open_lots()[0]
        self.assertIsNone(row["cost"])

    def test_multiplier_is_not_derived_from_output_quantity(self):
        item = event("buy", "buy", "2024-01-01", "10", "100")
        del item["multiplierAtEvent"]
        item["quantity"] = "50"
        result = replay([item])
        self.assertIsNone(result.lots[0].multiplier_at_open)
        self.assertIsNone(result.open_lots()[0]["quantity"])

    def test_partial_relief_across_two_lots(self):
        result = replay(
            [
                event("a", "buy", "2024-01-01", "4", "40"),
                event("b", "buy", "2024-02-01", "8", "160"),
                event("sale", "sell", "2024-03-01", "-10", "300"),
            ]
        )
        self.assertEqual([row.lot_id for row in result.closed], ["a", "b"])
        self.assertEqual([row.cost for row in result.closed], [Decimal("40.00"), Decimal("120.00")])
        self.assertEqual(result.open_lots({"mint": Decimal("1")})[0]["quantity"], Decimal("2"))


class HistoryDocumentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).parent / "fixtures" / "history.json"
        cls.document = json.loads(path.read_text(encoding="utf-8"))

    def test_document_shape_is_read(self):
        events = audit_cli.normalize_events(self.document)
        self.assertEqual(len(events), 3)
        self.assertEqual(events[0]["counterAsset"], "USDC")
        self.assertEqual(events[1]["counterAsset"], "USDT")

    def test_document_multiplier_fills_events(self):
        events = audit_cli.normalize_events(self.document)
        reported = audit_cli.history_multipliers(self.document)
        audit_cli.fill_event_multipliers(events, reported, [], {})
        self.assertEqual(events[0]["multiplierAtEvent"], "1.25")
        result = replay(events)
        self.assertEqual(result.closed[0].quantity, Decimal("1.25"))
        self.assertEqual(result.open_lots(reported)[0]["quantity"], Decimal("1.25"))

    def test_combined_mode_accepts_api_and_events(self):
        empty_api = ({"items": [], "total": 0}, [], [], {}, [])
        with patch.object(audit_cli, "api_inputs", return_value=empty_api) as mocked:
            with contextlib.redirect_stdout(io.StringIO()):
                code = audit_cli.run(
                    [
                        "--api",
                        "http://example.invalid/api",
                        "--wallet",
                        "fixture-wallet",
                        "--events",
                        str(Path(__file__).parent / "fixtures" / "history.json"),
                        "--method",
                        "fifo",
                    ]
                )
        self.assertEqual(code, 1)
        mocked.assert_called_once()

    def test_combined_mode_rejects_a_document_for_another_wallet(self):
        with patch.object(audit_cli, "api_inputs") as mocked:
            with self.assertRaises(audit_cli.InputError):
                audit_cli.run(
                    [
                        "--api",
                        "http://example.invalid/api",
                        "--wallet",
                        "other-wallet",
                        "--events",
                        str(Path(__file__).parent / "fixtures" / "history.json"),
                    ]
                )
        mocked.assert_not_called()

    def test_event_comparison_reports_both_sides(self):
        document = [{"id": "a", "kind": "buy"}, {"id": "b", "kind": "sell"}]
        app = [{"id": "a", "kind": "buy"}, {"id": "b", "kind": "transfer_out"}, {"id": "c", "kind": "buy"}]
        differences = audit_cli.compare_events(document, app)
        self.assertEqual(
            differences,
            ["Event b kind: document sell app transfer_out.", "Event c is only in the app."],
        )
        self.assertEqual(audit_cli.compare_events(app, app), [])


if __name__ == "__main__":
    unittest.main()