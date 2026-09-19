import { randomUUID } from "node:crypto";
import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  MEMO_PROGRAM_ID,
  buildStatement,
  hashStatement,
  memoForHash,
  methodLabel,
  renderStatementCsv,
  type CostMethod,
  type StatementData,
  type StatementMark,
} from "@workspace/ledger";
import type { StatementRow } from "@workspace/db";
import { env } from "../lib/env";
import { badRequest, notFound } from "../lib/errors";
import { explorerTxUrl, shortAddress } from "../lib/http";
import { logger } from "../lib/logger";
import { assetOf, corporateActionsForContext, corporateActionView, eventView, loadContext, pricingStatusView, walletStatusView, type WalletContext } from "./portfolio";
import { rpc } from "./rpc";
import { getStatement, insertStatement, listStatements, recordPrices, updateStatementProof } from "./store";

export interface StatementProofView {
  status: "none" | "pending" | "confirmed" | "failed" | "simulated";
  kind: "onchain_memo" | "simulated" | "none";
  hash: string;
  memo: string;
  signature: string | null;
  slot: number | null;
  signer: string | null;
  confirmedAt: string | null;
  explorerUrl: string | null;
  message: string;
}

function emptyProof(hash: string): StatementProofView {
  return {
    status: "none",
    kind: "none",
    hash,
    memo: memoForHash(hash),
    signature: null,
    slot: null,
    signer: null,
    confirmedAt: null,
    explorerUrl: null,
    message: "Not notarized yet.",
  };
}

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

function parseDay(value: string, endOfDay: boolean): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw badRequest("Dates must use YYYY-MM-DD.", { value });
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
  if (Number.isNaN(d.getTime())) throw badRequest("Invalid date.", { value });
  return d;
}

export interface CreateStatementInput {
  periodStart: string;
  periodEnd: string;
  method?: CostMethod;
  title?: string;
}

export async function createStatement(address: string, input: CreateStatementInput) {
  const periodStart = parseDay(input.periodStart, false);
  const periodEnd = parseDay(input.periodEnd, true);
  if (periodEnd < periodStart) throw badRequest("periodEnd must be on or after periodStart.");
  const method = input.method ?? "fifo";
  const ctx = await loadContext(address, method);
  const now = ctx.now;
  const effectiveEnd = periodEnd > now ? now : periodEnd;

  const marks = new Map<string, StatementMark>();
  for (const b of ctx.pricing.marks.values()) {
    marks.set(b.mint, {
      mint: b.mint,
      price: b.mark.price,
      referencePrice: b.referencePrice,
      multiplier: b.multiplier.current,
      source: b.mark.source,
      sourceLabel: b.mark.sourceLabel,
      publishTime: b.mark.publishTime ? new Date(b.mark.publishTime) : null,
      status: b.mark.status,
    });
  }
  const allActions = await corporateActionsForContext(ctx);
  const periodActions = allActions.filter((a) => {
    const at = a.effectiveAt ?? a.observedAt;
    return at >= periodStart && at <= periodEnd;
  });
  const data = buildStatement({
    address,
    periodStart,
    periodEnd: effectiveEnd,
    method,
    events: ctx.events,
    marks,
    corporateActions: periodActions,
    resolveAsset: assetOf,
    generatedAt: now,
    dataMode: ctx.wallet.isDemo ? "demo" : ctx.pricing.mode === "live" ? "live" : "fallback",
  });

  const title = input.title?.trim() || defaultTitle(periodStart, periodEnd);
  const purchases = data.activity.filter((r) => r.kind === "buy").reduce((a, r) => a + (r.grossUsd ?? 0), 0);
  const proceeds = data.activity.filter((r) => r.kind === "sell").reduce((a, r) => a + (r.grossUsd ?? 0), 0);
  const transfersInValue = data.activity.filter((r) => r.kind === "transfer_in" || r.kind === "wrapper_swap_in").reduce((a, r) => a + (r.grossUsd ?? 0), 0);
  const transfersOutValue = data.activity.filter((r) => r.kind === "transfer_out" || r.kind === "wrapper_swap_out").reduce((a, r) => a + (r.grossUsd ?? 0), 0);
  const processedById = new Map(ctx.engine.events.map((e) => [e.input.id, e]));
  const activity = data.activity
    .map((r) => processedById.get(r.id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => eventView(e, ctx));
  const pricing = pricingStatusView(ctx);
  const body = {
    id: `stmt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    address,
    displayAddress: walletStatusView(ctx.wallet, ctx.simulatedTrades).displayAddress,
    isDemo: ctx.wallet.isDemo,
    title,
    periodStart: dateOnly(periodStart),
    periodEnd: dateOnly(periodEnd),
    method,
    generatedAt: now.toISOString(),
    currency: "USD",
    hashAlgorithm: "sha256",
    totals: {
      openingValue: data.totals.openingValue,
      closingValue: data.totals.closingValue,
      netContributions: purchases + transfersInValue - proceeds - transfersOutValue,
      purchases,
      proceeds,
      transfersInValue,
      transfersOutValue,
      realizedPnl: data.totals.realizedPnl,
      realizedShortTerm: data.totals.realizedShortTerm,
      realizedLongTerm: data.totals.realizedLongTerm,
      unrealizedPnl: data.totals.unrealizedPnl,
      incomeEstimate: data.totals.incomeEstimate,
      fees: data.totals.feesPaid,
      tradesCount: data.activity.filter((r) => r.kind === "buy" || r.kind === "sell").length,
      corporateActionsCount: data.corporateActions.length,
    },
    positions: data.positions.map((p) => ({
      mint: p.mint,
      symbol: p.symbol,
      name: p.name,
      issuer: p.issuer,
      openingQuantity: p.openingQuantity,
      closingQuantity: p.closingQuantity,
      closingPrice: p.closingPrice,
      priceSource: p.priceSource,
      closingValue: p.closingValue,
      costBasis: p.costBasis,
      unrealizedPnl: p.unrealizedPnl,
      realizedPnlInPeriod: p.realizedPnlInPeriod,
      multiplier: marks.get(p.mint)?.multiplier ?? 1,
      basisStatus: p.basisStatus,
    })),
    activity,
    corporateActions: data.corporateActions.map((a) => corporateActionView(a, ctx)),
    closedLots: data.closedLots.map((l) => ({
      lotId: l.lotId,
      quantity: l.quantity,
      costBasis: l.costBasis,
      proceeds: l.proceeds,
      realizedPnl: l.realized,
      term: l.term,
    })),
    pricing,
    assumptions: data.assumptions,
    dataSources: buildDataSources(ctx, marks),
  };
  const hash = hashStatement({ ...body, id: undefined });
  const csv = renderStatementCsv(data, hash);

  await recordPrices(
    [...ctx.pricing.marks.values()]
      .filter((b) => b.mark.price !== null && b.mark.source !== "demo")
      .map((b) => ({ mint: b.mint, price: b.mark.price as number, referencePrice: b.referencePrice, source: b.mark.source, observedAt: now })),
  ).catch((err) => logger.warn({ err }, "Could not record price observations"));

  const row = await insertStatement({
    id: body.id,
    address,
    title,
    periodStart,
    periodEnd,
    method,
    generatedAt: now,
    hash,
    body: { ...body, hash, csv, statementData: serializeStatementData(data) },
    proof: emptyProof(hash) as unknown as Record<string, unknown>,
  });
  return statementView(row);
}

function buildDataSources(ctx: WalletContext, marks: Map<string, StatementMark>) {
  const isDemo = ctx.wallet.isDemo;
  const sources: Array<{ id: string; label: string; mode: string; detail: string; requiredEnv: string[] }> = [
    isDemo
      ? { id: "demo_ledger", label: "Scripted demo ledger", mode: "demo", detail: "Transactions come from a stored scenario, not from the chain.", requiredEnv: [] }
      : {
          id: "solana_rpc",
          label: "Solana transaction history",
          mode: "live",
          detail: `${ctx.wallet.signaturesScanned} signatures scanned, ${ctx.wallet.eventsIndexed} ledger events.`,
          requiredEnv: ["SOLANA_RPC_URL", "HELIUS_API_KEY"],
        },
  ];
  const counts = new Map<string, { label: string; count: number }>();
  for (const m of marks.values()) {
    if (m.price === null) continue;
    const cur = counts.get(m.source) ?? { label: m.sourceLabel, count: 0 };
    cur.count += 1;
    counts.set(m.source, cur);
  }
  for (const [source, { label, count }] of counts) {
    sources.push({
      id: source,
      label,
      mode: source === "pyth" ? "live" : source === "demo" ? "demo" : "fallback",
      detail: `${count} position${count === 1 ? "" : "s"} marked with ${label}.`,
      requiredEnv: source === "pyth" ? ["PYTH_API_KEY"] : [],
    });
  }
  return sources;
}

function serializeStatementData(data: StatementData): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

function defaultTitle(start: Date, end: Date): string {
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const fmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  if (sameMonth) return `Statement for ${fmt.format(start)}`;
  return `Statement ${dateOnly(start)} to ${dateOnly(end)}`;
}

export function statementView(row: StatementRow) {
  const { csv: _csv, statementData: _data, ...body } = row.body as Record<string, unknown> & { csv?: string; statementData?: unknown };
  const proof = (row.proof as unknown as StatementProofView | null) ?? emptyProof(row.hash);
  return {
    ...body,
    id: row.id,
    hash: row.hash,
    proof,
    csvUrl: `/api/statements/${row.id}/export.csv`,
    pdfUrl: `/api/statements/${row.id}/export.pdf`,
  };
}

export function statementSummaryView(row: StatementRow) {
  const body = row.body as { totals?: { closingValue?: number; realizedPnl?: number } };
  const proof = row.proof as unknown as StatementProofView | null;
  return {
    id: row.id,
    address: row.address,
    title: row.title,
    periodStart: dateOnly(row.periodStart),
    periodEnd: dateOnly(row.periodEnd),
    method: row.method,
    generatedAt: row.generatedAt.toISOString(),
    hash: row.hash,
    closingValue: body.totals?.closingValue ?? 0,
    realizedPnl: body.totals?.realizedPnl ?? 0,
    proofStatus: proof?.status ?? "none",
  };
}

export async function requireStatement(id: string): Promise<StatementRow> {
  const row = await getStatement(id);
  if (!row) throw notFound("Statement not found.", { statementId: id });
  return row;
}

export async function listStatementSummaries(address: string) {
  const rows = await listStatements(address);
  return rows.map(statementSummaryView);
}

export function statementCsv(row: StatementRow): string {
  const body = row.body as { csv?: string };
  if (body.csv) return body.csv;
  throw notFound("This statement has no CSV export.");
}

export function statementFileName(row: StatementRow, ext: string): string {
  const body = row.body as { displayAddress?: string };
  const who = (body.displayAddress ?? row.address).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `clearbook-${who}-${dateOnly(row.periodStart)}-${dateOnly(row.periodEnd)}.${ext}`;
}

/* Notarization */

export interface NotarizationPayloadView {
  statementId: string;
  hash: string;
  memo: string;
  memoProgramId: string;
  cluster: string;
  mode: "onchain" | "simulated";
  instructions: string;
  transaction: string | null;
  lastValidBlockHeight: number | null;
  proof: StatementProofView;
}

export async function prepareNotarization(id: string, payer?: string): Promise<NotarizationPayloadView> {
  const row = await requireStatement(id);
  const memo = memoForHash(row.hash);
  const proof = (row.proof as unknown as StatementProofView | null) ?? emptyProof(row.hash);
  const base = { statementId: row.id, hash: row.hash, memo, memoProgramId: MEMO_PROGRAM_ID, cluster: env.cluster, proof };
  if (!payer) {
    return {
      ...base,
      mode: "simulated",
      instructions: "Connect a wallet to write the statement hash to Solana as a memo transaction, or record a simulated proof for the demo.",
      transaction: null,
      lastValidBlockHeight: null,
    };
  }
  let payerKey: PublicKey;
  try {
    payerKey = new PublicKey(payer);
  } catch {
    throw badRequest("payer is not a valid public key.", { payer });
  }
  const { blockhash, lastValidBlockHeight } = await rpc().getLatestBlockhash();
  const ix = new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [{ pubkey: payerKey, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
  const message = new TransactionMessage({ payerKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  return {
    ...base,
    mode: "onchain",
    instructions: "Sign and send this transaction with your wallet. It contains one memo instruction with the statement hash and costs only the network fee. Then submit the signature to verify.",
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    lastValidBlockHeight,
  };
}

export async function submitNotarization(id: string, input: { signature?: string | null; simulate: boolean }): Promise<StatementProofView> {
  const row = await requireStatement(id);
  const memo = memoForHash(row.hash);
  const now = new Date();
  if (input.simulate) {
    const proof: StatementProofView = {
      status: "simulated",
      kind: "simulated",
      hash: row.hash,
      memo,
      signature: null,
      slot: null,
      signer: null,
      confirmedAt: now.toISOString(),
      explorerUrl: null,
      message: "Simulated proof. The hash was computed and recorded, but no transaction was sent to Solana.",
    };
    await updateStatementProof(row.id, proof as unknown as Record<string, unknown>);
    return proof;
  }
  if (!input.signature) throw badRequest("signature is required unless simulate is true.");
  const tx = await rpc().getTransaction(input.signature);
  if (!tx) {
    const proof: StatementProofView = {
      status: "pending",
      kind: "onchain_memo",
      hash: row.hash,
      memo,
      signature: input.signature,
      slot: null,
      signer: null,
      confirmedAt: null,
      explorerUrl: explorerTxUrl(input.signature, env.cluster),
      message: "Transaction not confirmed yet. Verification will be retried when you reopen the statement.",
    };
    await updateStatementProof(row.id, proof as unknown as Record<string, unknown>);
    return proof;
  }
  const memoFound = tx.transaction.message.instructions.some((ix) => {
    if (ix.programId !== MEMO_PROGRAM_ID) return false;
    const parsed = ix.parsed;
    return typeof parsed === "string" ? parsed === memo : false;
  }) || (tx.meta?.logMessages ?? []).some((l) => l.includes(`Memo (len ${memo.length}): "${memo}"`));
  const signer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey ?? null;
  const ok = memoFound && !tx.meta?.err;
  const proof: StatementProofView = {
    status: ok ? "confirmed" : "failed",
    kind: "onchain_memo",
    hash: row.hash,
    memo,
    signature: input.signature,
    slot: tx.slot,
    signer,
    confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : now.toISOString(),
    explorerUrl: explorerTxUrl(input.signature, env.cluster),
    message: ok
      ? `Memo verified on chain in slot ${tx.slot}, signed by ${signer ? shortAddress(signer) : "unknown"}.`
      : tx.meta?.err
        ? "The transaction failed on chain."
        : "The transaction does not contain the expected memo.",
  };
  await updateStatementProof(row.id, proof as unknown as Record<string, unknown>);
  return proof;
}

/** Re-checks a pending proof when the statement is read. */
export async function refreshPendingProof(row: StatementRow): Promise<StatementRow> {
  const proof = row.proof as unknown as StatementProofView | null;
  if (!proof || proof.status !== "pending" || !proof.signature) return row;
  try {
    const updated = await submitNotarization(row.id, { signature: proof.signature, simulate: false });
    return { ...row, proof: updated as unknown as Record<string, unknown> };
  } catch (err) {
    logger.warn({ err, statementId: row.id }, "Proof refresh failed");
    return row;
  }
}

export function statementMethodLabel(method: CostMethod): string {
  return methodLabel(method);
}
