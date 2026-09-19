import { Router, type IRouter } from "express";
import {
  GetPortfolioParams,
  GetPortfolioQueryParams,
  GetPortfolioResponse,
  GetPricingStatusParams,
  GetPricingStatusResponse,
  GetWalletStatusParams,
  GetWalletStatusResponse,
  IndexWalletParams,
  IndexWalletResponse,
  ListActivityParams,
  ListActivityQueryParams,
  ListActivityResponse,
  ListCorporateActionsParams,
  ListCorporateActionsResponse,
  ListLotsParams,
  ListLotsQueryParams,
  ListLotsResponse,
  ResetWalletParams,
  ResetWalletResponse,
} from "@workspace/api-zod";
import { isDemoId } from "@workspace/ledger";
import { shortAddress } from "../lib/http";
import { assertAddress, indexWallet, loadDemoWallet } from "../services/indexer";
import {
  activityView,
  corporateActionView,
  corporateActionsForContext,
  loadContext,
  lotsView,
  portfolioView,
  pricingStatusView,
  walletStatusView,
} from "../services/portfolio";
import { countEvents, deleteEventsBySource, getWallet } from "../services/store";

const router: IRouter = Router();

router.post("/wallets/:address/index", async (req, res) => {
  const { address } = IndexWalletParams.parse(req.params);
  const wallet = await indexWallet(address);
  res.json(IndexWalletResponse.parse(walletStatusView(wallet, await countEvents(address, "simulated"))));
});

router.post("/wallets/:address/reset", async (req, res) => {
  const { address } = ResetWalletParams.parse(req.params);
  assertAddress(address);
  await deleteEventsBySource(address, "simulated");
  const wallet = isDemoId(address) ? await loadDemoWallet(address) : ((await getWallet(address)) ?? (await indexWallet(address)));
  res.json(ResetWalletResponse.parse(walletStatusView(wallet, 0)));
});

router.get("/wallets/:address/status", async (req, res) => {
  const { address } = GetWalletStatusParams.parse(req.params);
  assertAddress(address);
  const wallet = await getWallet(address);
  if (!wallet) {
    res.json(
      GetWalletStatusResponse.parse({
        address,
        displayAddress: isDemoId(address) ? address : shortAddress(address),
        isDemo: isDemoId(address),
        demoLabel: null,
        state: "not_indexed",
        source: "unavailable",
        message: "This wallet has not been indexed yet.",
        eventsIndexed: 0,
        signaturesScanned: 0,
        unknownTransactions: 0,
        lastIndexedAt: null,
        simulatedTrades: 0,
        warnings: [],
      }),
    );
    return;
  }
  res.json(GetWalletStatusResponse.parse(walletStatusView(wallet, await countEvents(address, "simulated"))));
});

router.get("/wallets/:address/portfolio", async (req, res) => {
  const { address } = GetPortfolioParams.parse(req.params);
  const { method } = GetPortfolioQueryParams.parse(req.query);
  const ctx = await loadContext(address, method ?? "fifo");
  res.json(GetPortfolioResponse.parse(portfolioView(ctx)));
});

router.get("/wallets/:address/lots", async (req, res) => {
  const { address } = ListLotsParams.parse(req.params);
  const { method, mint, status } = ListLotsQueryParams.parse(req.query);
  const ctx = await loadContext(address, method ?? "fifo");
  res.json(ListLotsResponse.parse(lotsView(ctx, { mint, status })));
});

router.get("/wallets/:address/activity", async (req, res) => {
  const { address } = ListActivityParams.parse(req.params);
  const { method, mint, limit, cursor } = ListActivityQueryParams.parse(req.query);
  const ctx = await loadContext(address, method ?? "fifo");
  res.json(ListActivityResponse.parse(activityView(ctx, { mint, limit, cursor })));
});

router.get("/wallets/:address/events", async (req, res) => {
  const { address } = ListCorporateActionsParams.parse(req.params);
  const ctx = await loadContext(address, "fifo");
  const actions = await corporateActionsForContext(ctx);
  res.json(ListCorporateActionsResponse.parse(actions.map((a) => corporateActionView(a, ctx))));
});

router.get("/wallets/:address/pricing", async (req, res) => {
  const { address } = GetPricingStatusParams.parse(req.params);
  const ctx = await loadContext(address, "fifo");
  res.json(GetPricingStatusResponse.parse(pricingStatusView(ctx)));
});

export default router;
