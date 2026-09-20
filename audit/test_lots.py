import unittest
from decimal import Decimal

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


if __name__ == "__main__":
    unittest.main()