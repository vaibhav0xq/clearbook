import { collectTaxLots, getAsset, renderTaxLotsCsv, summarizeTaxYears, type TaxLotRow } from "@workspace/ledger";
import { conflict } from "../lib/errors";
import { walletStatusView, type WalletContext } from "./portfolio";

/**
 * Tax lots are the closed side of the ledger laid out the way a broker reports it: one row per lot
 * relieved, with the Form 1099-B boxes so the figures carry to Form 8949. Clearbook is not a broker
 * and files nothing. The export says which rows carry an estimated or unknown basis and which come
 * from simulated sales. It flags losses with a buy of the same stock within 30 days on either side.
 * That flag is a check for the holder to review, not a determination.
 */

const NOTES = [
  "Columns follow Form 1099-B boxes 1a to 1e so the figures carry to Form 8949. Clearbook is not a broker and files nothing.",
  "Sale dates use UTC calendar days, the same boundary statements use. A year appears once it has a sale or a wrapper swap. Transfers out are not disposals.",
  "Rows with unknown proceeds or an estimated or unknown basis need figures from your own records before filing. Their gain is left blank.",
  "A wash sale flag marks a loss with a buy of the same stock within 30 days before or after the sale, in any wrapper. Nothing is adjusted.",
  "Simulated sales recorded in this browser are included and counted separately.",
];

function taxLotsFor(ctx: WalletContext): TaxLotRow[] {
  return collectTaxLots(ctx.engine, getAsset);
}

export function taxLotReportView(ctx: WalletContext) {
  const years = summarizeTaxYears(taxLotsFor(ctx));
  return {
    address: ctx.address,
    method: ctx.method,
    generatedAt: ctx.now.toISOString(),
    years: years.map((y) => ({
      ...y,
      csvUrl: `/api/wallets/${encodeURIComponent(ctx.address)}/tax-lots/export.csv?year=${y.year}&method=${ctx.method}`,
    })),
    notes: NOTES,
  };
}

export function taxLotsCsv(ctx: WalletContext, year: number): { fileName: string; body: string } {
  // The export is a record of the ledger, so like a statement it waits for indexing to finish.
  if (ctx.wallet.state === "indexing") throw conflict("This wallet is still indexing. Download the export once indexing has finished.");
  const body = renderTaxLotsCsv(taxLotsFor(ctx), {
    address: ctx.address,
    year,
    method: ctx.method,
    generatedAt: ctx.now,
    dataMode: ctx.wallet.isDemo ? "demo" : ctx.pricing.mode === "live" ? "live" : "fallback",
  });
  const who = walletStatusView(ctx.wallet, ctx.simulatedTrades)
    .displayAddress.replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  return { fileName: `clearbook-tax-lots-${who}-${year}-${ctx.method}.csv`, body };
}
