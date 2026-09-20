import { Router, type IRouter } from "express";
import {
  ExportTaxLotsCsvParams,
  ExportTaxLotsCsvQueryParams,
  GetPortfolioParams,
  GetPortfolioQueryParams,
  GetPortfolioResponse,
  GetPricingStatusParams,
  GetPricingStatusResponse,
  GetTaxLotsParams,
  GetTaxLotsQueryParams,
  GetTaxLotsResponse,
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
import { assertAddress, ensureWalletRow, loadDemoWallet, startIndexing } from "../services/indexer";
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
import { taxLotReportView, taxLotsCsv } from "../services/tax";

const router: IRouter = Router();

// Indexing runs in the background. The response shows the wallet as indexing and the client polls
// the status endpoint until the run has finished.
router.post("/wallets/:address/index", async (req, res) => {
  const { address } = IndexWalletParams.parse(req.params);
  const wallet = await startIndexing(address);
  res.json(IndexWalletResponse.parse(walletStatusView(wallet, await countEvents(address, "simulated"))));
});

router.post("/wallets/:address/reset", async (req, res) => {
  const { address } = ResetWalletParams.parse(req.params);
  assertAddress(address);
  await deleteEventsBySource(address, "simulated");
  const wallet = isDemoId(address) ? await loadDemoWallet(address) : ((await getWallet(address)) ?? (await startIndexing(address)));
  res.json(ResetWalletResponse.parse(walletStatusView(wallet, 0)));
});

router.get("/wallets/:address/status", async (req, res) => {
  const { address } = GetWalletStatusParams.parse(req.params);
  assertAddress(address);
  // Opening a live wallet is the request to index it, whichever page asks first. The same rule
  // restarts a run that was lost to a crash, so a client polling here never waits on a dead run.
  const wallet = await ensureWalletRow(address);
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

router.get("/wallets/:address/tax-lots", async (req, res) => {
  const { address } = GetTaxLotsParams.parse(req.params);
  const { method } = GetTaxLotsQueryParams.parse(req.query);
  const ctx = await loadContext(address, method ?? "fifo");
  res.json(GetTaxLotsResponse.parse(taxLotReportView(ctx)));
});

router.get("/wallets/:address/tax-lots/export.csv", async (req, res) => {
  const { address } = ExportTaxLotsCsvParams.parse(req.params);
  const { method, year } = ExportTaxLotsCsvQueryParams.parse(req.query);
  const ctx = await loadContext(address, method ?? "fifo");
  const file = taxLotsCsv(ctx, year);
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${file.fileName}"`);
  res.send(file.body);
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
