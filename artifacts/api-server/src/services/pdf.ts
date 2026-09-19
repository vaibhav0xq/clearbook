import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { StatementRow } from "@workspace/db";
import type { StatementProofView } from "./statements";

/**
 * Renders a statement as a plain, printable PDF. Layout is a single column
 * with simple tables. Everything shown comes from the stored statement body
 * so the PDF always matches the hash that was notarized.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 44;
const INK = rgb(0.09, 0.1, 0.12);
const MUTED = rgb(0.42, 0.44, 0.48);
const RULE = rgb(0.82, 0.83, 0.86);

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  pageNo: number;
}

const money = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined || Number.isNaN(v) ? "n/a" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const qty = (v: number | null | undefined): string =>
  v === null || v === undefined ? "n/a" : v.toLocaleString("en-US", { maximumFractionDigits: 6 });
const pct = (v: number | null | undefined): string => (v === null || v === undefined ? "n/a" : `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(2)}%`);
const when = (iso: string | null | undefined): string => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "n/a");

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageNo += 1;
  ctx.y = PAGE_H - MARGIN;
  ctx.page.drawText(`Clearbook statement  |  page ${ctx.pageNo}`, { x: MARGIN, y: 24, size: 8, font: ctx.font, color: MUTED });
}

function ensure(ctx: Ctx, height: number): void {
  if (ctx.y - height < MARGIN + 20) newPage(ctx);
}

function text(ctx: Ctx, value: string, opts: { size?: number; bold?: boolean; mono?: boolean; color?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}): void {
  const size = opts.size ?? 9.5;
  const font = opts.mono ? ctx.mono : opts.bold ? ctx.bold : ctx.font;
  const maxWidth = PAGE_W - MARGIN * 2 - ((opts.x ?? MARGIN) - MARGIN);
  const lines = wrap(value, font, size, maxWidth);
  for (const line of lines) {
    ensure(ctx, size + 4);
    ctx.page.drawText(line, { x: opts.x ?? MARGIN, y: ctx.y - size, size, font, color: opts.color ?? INK });
    ctx.y -= size + 3.5;
  }
  ctx.y -= opts.gap ?? 2;
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) cur = candidate;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function heading(ctx: Ctx, value: string): void {
  ensure(ctx, 30);
  ctx.y -= 8;
  text(ctx, value.toUpperCase(), { size: 8.5, bold: true, color: MUTED, gap: 0 });
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y }, thickness: 0.6, color: RULE });
  ctx.y -= 8;
}

interface Column {
  label: string;
  width: number;
  align?: "left" | "right";
}

function table(ctx: Ctx, columns: Column[], rows: string[][], emptyLabel: string): void {
  const size = 8.2;
  const rowH = 14;
  const drawHeader = () => {
    ensure(ctx, rowH * 2);
    let x = MARGIN;
    for (const c of columns) {
      const label = c.label;
      const w = ctx.bold.widthOfTextAtSize(label, size);
      ctx.page.drawText(label, { x: c.align === "right" ? x + c.width - w : x, y: ctx.y - size, size, font: ctx.bold, color: MUTED });
      x += c.width;
    }
    ctx.y -= rowH;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 3 }, end: { x: PAGE_W - MARGIN, y: ctx.y + 3 }, thickness: 0.5, color: RULE });
  };
  drawHeader();
  if (rows.length === 0) {
    text(ctx, emptyLabel, { size: 8.5, color: MUTED });
    return;
  }
  for (const row of rows) {
    if (ctx.y - rowH < MARGIN + 20) {
      newPage(ctx);
      drawHeader();
    }
    let x = MARGIN;
    row.forEach((cell, i) => {
      const c = columns[i];
      let value = cell;
      while (ctx.font.widthOfTextAtSize(value, size) > c.width - 4 && value.length > 3) value = `${value.slice(0, -2)}…`;
      const w = ctx.font.widthOfTextAtSize(value, size);
      ctx.page.drawText(value, { x: c.align === "right" ? x + c.width - w : x, y: ctx.y - size, size, font: ctx.font, color: INK });
      x += c.width;
    });
    ctx.y -= rowH;
  }
  ctx.y -= 4;
}

function keyValues(ctx: Ctx, pairs: Array<[string, string]>): void {
  const size = 9;
  const colW = (PAGE_W - MARGIN * 2) / 2;
  for (let i = 0; i < pairs.length; i += 2) {
    ensure(ctx, 26);
    for (let j = 0; j < 2; j++) {
      const pair = pairs[i + j];
      if (!pair) continue;
      const x = MARGIN + j * colW;
      ctx.page.drawText(pair[0], { x, y: ctx.y - 8, size: 7.5, font: ctx.font, color: MUTED });
      ctx.page.drawText(pair[1], { x, y: ctx.y - 20, size, font: ctx.bold, color: INK });
    }
    ctx.y -= 28;
  }
}

interface Body {
  title: string;
  displayAddress: string;
  address: string;
  isDemo: boolean;
  periodStart: string;
  periodEnd: string;
  method: string;
  generatedAt: string;
  hash: string;
  totals: Record<string, number | null>;
  positions: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown>>;
  corporateActions: Array<Record<string, unknown>>;
  closedLots: Array<Record<string, unknown>>;
  pricing: { providerLabel: string; headline: string; detail: string; asOf: string };
  assumptions: string[];
  dataSources: string[];
}

export async function renderStatementPdf(row: StatementRow): Promise<Uint8Array> {
  const body = row.body as unknown as Body;
  const proof = row.proof as unknown as StatementProofView | null;
  const doc = await PDFDocument.create();
  doc.setTitle(body.title);
  doc.setAuthor("Clearbook");
  doc.setSubject(`Statement ${body.periodStart} to ${body.periodEnd}`);
  const ctx: Ctx = {
    doc,
    page: undefined as unknown as PDFPage,
    y: 0,
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
    pageNo: 0,
  };
  newPage(ctx);

  text(ctx, "Clearbook", { size: 18, bold: true, gap: 0 });
  text(ctx, "Brokerage style statement for tokenized stocks on Solana", { size: 9, color: MUTED, gap: 8 });
  text(ctx, body.title, { size: 13, bold: true, gap: 2 });
  if (body.isDemo) text(ctx, "Demo wallet. Activity is scripted and prices may come from a snapshot.", { size: 8.5, color: MUTED });
  keyValues(ctx, [
    ["Account", body.displayAddress === body.address ? body.address : `${body.displayAddress}  (${body.address})`],
    ["Period", `${body.periodStart} to ${body.periodEnd}`],
    ["Cost method", body.method.toUpperCase()],
    ["Generated", when(body.generatedAt)],
  ]);
  text(ctx, "Statement hash (sha256)", { size: 7.5, color: MUTED, gap: 0 });
  text(ctx, body.hash, { size: 8, mono: true, gap: 4 });

  heading(ctx, "Summary");
  const t = body.totals;
  keyValues(ctx, [
    ["Opening value", money(t.openingValue)],
    ["Closing value", money(t.closingValue)],
    ["Purchases", money(t.purchases)],
    ["Proceeds", money(t.proceeds)],
    ["Realized P/L", money(t.realizedPnl)],
    ["Unrealized P/L", money(t.unrealizedPnl)],
    ["Realized short term", money(t.realizedShortTerm)],
    ["Realized long term", money(t.realizedLongTerm)],
    ["Income estimate", money(t.incomeEstimate)],
    ["Fees", money(t.fees)],
  ]);

  heading(ctx, "Positions at period end");
  table(
    ctx,
    [
      { label: "Symbol", width: 62 },
      { label: "Issuer", width: 58 },
      { label: "Opening qty", width: 66, align: "right" },
      { label: "Closing qty", width: 66, align: "right" },
      { label: "Price", width: 62, align: "right" },
      { label: "Value", width: 72, align: "right" },
      { label: "Cost basis", width: 66, align: "right" },
      { label: "Unrealized", width: 56, align: "right" },
    ],
    body.positions.map((p) => [
      String(p.symbol),
      String(p.issuer),
      qty(p.openingQuantity as number),
      qty(p.closingQuantity as number),
      money(p.closingPrice as number | null),
      money(p.closingValue as number | null),
      p.basisStatus === "complete" ? money(p.costBasis as number | null) : `${money(p.costBasis as number | null)}*`,
      money(p.unrealizedPnl as number | null),
    ]),
    "No positions at the end of the period.",
  );
  if (body.positions.some((p) => p.basisStatus !== "complete")) {
    text(ctx, "* Cost basis is partial or unknown for this position. See assumptions.", { size: 7.5, color: MUTED });
  }

  heading(ctx, "Activity in period");
  table(
    ctx,
    [
      { label: "Date", width: 76 },
      { label: "Type", width: 78 },
      { label: "Symbol", width: 58 },
      { label: "Quantity", width: 70, align: "right" },
      { label: "Price", width: 62, align: "right" },
      { label: "Amount", width: 72, align: "right" },
      { label: "Realized", width: 60, align: "right" },
      { label: "Source", width: 32 },
    ],
    body.activity.map((a) => [
      when(a.blockTime as string).slice(0, 16),
      String(a.kindLabel),
      String(a.symbol),
      qty(a.quantity as number),
      money(a.pricePerShare as number | null),
      money(a.grossAmount as number | null),
      money(a.realizedPnl as number | null),
      String(a.source),
    ]),
    "No activity in this period.",
  );

  heading(ctx, "Corporate actions and multiplier events");
  table(
    ctx,
    [
      { label: "Effective", width: 80 },
      { label: "Symbol", width: 60 },
      { label: "Event", width: 120 },
      { label: "Multiplier", width: 110, align: "right" },
      { label: "Value effect", width: 70, align: "right" },
      { label: "Confidence", width: 66 },
    ],
    body.corporateActions.map((c) => [
      when(c.effectiveAt as string).slice(0, 10),
      String(c.symbol),
      String(c.kindLabel),
      `${Number(c.previousMultiplier).toFixed(6)} to ${Number(c.newMultiplier).toFixed(6)}`,
      money(c.valueEffect as number | null),
      String(c.confidence),
    ]),
    "No multiplier changes were observed in this period.",
  );

  heading(ctx, "Closed lots");
  table(
    ctx,
    [
      { label: "Lot", width: 150 },
      { label: "Quantity", width: 80, align: "right" },
      { label: "Cost basis", width: 90, align: "right" },
      { label: "Proceeds", width: 90, align: "right" },
      { label: "Realized", width: 60, align: "right" },
      { label: "Term", width: 36 },
    ],
    body.closedLots.map((l) => [
      String(l.lotId),
      qty(l.quantity as number),
      money(l.costBasis as number | null),
      money(l.proceeds as number),
      money(l.realizedPnl as number | null),
      String(l.term),
    ]),
    "No lots were closed in this period.",
  );

  heading(ctx, "Pricing");
  text(ctx, `${body.pricing.headline}. ${body.pricing.detail}`, { size: 8.5 });
  text(ctx, `Marks as of ${when(body.pricing.asOf)}.`, { size: 8.5, color: MUTED });

  heading(ctx, "Assumptions");
  for (const a of body.assumptions) text(ctx, `• ${a}`, { size: 8.5 });

  heading(ctx, "Data sources");
  for (const s of body.dataSources) text(ctx, `• ${s}`, { size: 8.5 });

  heading(ctx, "Proof");
  if (!proof || proof.status === "none") {
    text(ctx, "Not notarized. The hash above can be written to Solana as a memo transaction from the app.", { size: 8.5 });
  } else {
    text(ctx, `Status: ${proof.status}. ${proof.message}`, { size: 8.5 });
    if (proof.signature) text(ctx, `Signature: ${proof.signature}`, { size: 7.5, mono: true });
    if (proof.explorerUrl) text(ctx, proof.explorerUrl, { size: 7.5, color: MUTED });
  }
  ctx.y -= 6;
  text(ctx, "Clearbook is an accounting view built from public chain data. It is not tax advice and the issuers named are not affiliated with it.", { size: 7.5, color: MUTED });

  return doc.save();
}
