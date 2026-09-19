import { Router, type IRouter } from "express";
import {
  ConfirmTradeBody,
  ConfirmTradeParams,
  ConfirmTradeResponse,
  PrepareTradeBody,
  PrepareTradeParams,
  PrepareTradeResponse,
  QuoteTradeBody,
  QuoteTradeParams,
  QuoteTradeResponse,
  SimulateTradeBody,
  SimulateTradeParams,
  SimulateTradeResponse,
} from "@workspace/api-zod";
import { confirmTrade, prepareTrade, quoteTrade, simulateTrade } from "../services/trades";

const router: IRouter = Router();

router.post("/wallets/:address/trades/quote", async (req, res) => {
  const { address } = QuoteTradeParams.parse(req.params);
  const body = QuoteTradeBody.parse(req.body);
  res.json(QuoteTradeResponse.parse(await quoteTrade(address, body)));
});

router.post("/wallets/:address/trades/prepare", async (req, res) => {
  const { address } = PrepareTradeParams.parse(req.params);
  const body = PrepareTradeBody.parse(req.body);
  res.json(PrepareTradeResponse.parse(await prepareTrade(address, body)));
});

router.post("/wallets/:address/trades/confirm", async (req, res) => {
  const { address } = ConfirmTradeParams.parse(req.params);
  const body = ConfirmTradeBody.parse(req.body);
  res.json(ConfirmTradeResponse.parse(await confirmTrade(address, body)));
});

router.post("/wallets/:address/trades/simulate", async (req, res) => {
  const { address } = SimulateTradeParams.parse(req.params);
  const body = SimulateTradeBody.parse(req.body);
  res.json(SimulateTradeResponse.parse(await simulateTrade(address, body)));
});

export default router;
