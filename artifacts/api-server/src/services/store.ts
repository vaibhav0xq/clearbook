import { and, asc, desc, eq, isNull, lt, ne, or, type SQL } from "drizzle-orm";
import {
  db,
  ledgerEventsTable,
  multiplierObservationsTable,
  priceObservationsTable,
  statementsTable,
  tradeQuotesTable,
  walletsTable,
  type InsertLedgerEvent,
  type InsertStatement,
  type InsertTradeQuote,
  type LedgerEventRow,
  type StatementRow,
  type TradeQuoteRow,
  type Wallet,
} from "@workspace/db";
import type { LedgerEventInput, MultiplierObservation } from "@workspace/ledger";
import { currentViewer } from "../lib/viewer";

/** Persistence helpers. Everything about a wallet is keyed by its base58 address or demo id. */

export async function getWallet(address: string): Promise<Wallet | undefined> {
  const rows = await db.select().from(walletsTable).where(eq(walletsTable.address, address)).limit(1);
  return rows[0];
}

export async function upsertWallet(values: Partial<Wallet> & { address: string }): Promise<Wallet> {
  const rows = await db
    .insert(walletsTable)
    .values(values)
    .onConflictDoUpdate({ target: walletsTable.address, set: { ...values, updatedAt: new Date() } })
    .returning();
  return rows[0];
}

/**
 * Marks a wallet as indexing and returns the row when this caller now owns the run. The update
 * applies only while no run is in flight or the last one stopped writing progress for longer
 * than `staleMs`, and Postgres decides that in one statement, so two processes that start the
 * same wallet at the same time cannot both win. Returns undefined when another run owns it.
 */
export async function claimIndexRun(values: Partial<Wallet> & { address: string }, staleMs: number): Promise<Wallet | undefined> {
  const staleBefore = new Date(Date.now() - staleMs);
  const rows = await db
    .insert(walletsTable)
    .values(values)
    .onConflictDoUpdate({
      target: walletsTable.address,
      set: { ...values, updatedAt: new Date() },
      setWhere: or(ne(walletsTable.state, "indexing"), lt(walletsTable.updatedAt, staleBefore)),
    })
    .returning();
  return rows[0];
}

export function rowToEvent(row: LedgerEventRow): LedgerEventInput {
  return {
    id: row.id,
    signature: row.signature,
    slot: row.slot,
    blockTime: row.blockTime,
    kind: row.kind as LedgerEventInput["kind"],
    mint: row.mint,
    rawDelta: BigInt(row.rawDelta),
    grossUsd: row.grossUsd,
    feeUsd: row.feeUsd,
    counterAsset: row.counterAsset,
    counterAmount: row.counterAmount,
    multiplierAtEvent: row.multiplierAtEvent,
    referencePriceUsd: row.referencePriceUsd,
    source: row.source as LedgerEventInput["source"],
    venue: row.venue,
    note: row.note,
  };
}

export function eventToRow(address: string, e: LedgerEventInput, sequence = 0): InsertLedgerEvent {
  return {
    id: e.id,
    address,
    signature: e.signature,
    slot: e.slot,
    blockTime: e.blockTime,
    kind: e.kind,
    mint: e.mint,
    rawDelta: e.rawDelta.toString(),
    grossUsd: e.grossUsd,
    feeUsd: e.feeUsd,
    counterAsset: e.counterAsset,
    counterAmount: e.counterAmount,
    multiplierAtEvent: e.multiplierAtEvent,
    referencePriceUsd: e.referencePriceUsd,
    source: e.source,
    venue: e.venue,
    note: e.note,
    sequence,
  };
}

/**
 * Simulated events belong to the browser session that recorded them. Everything read from the
 * chain or a demo script is visible to every viewer of the wallet.
 */
function visibleTo(viewer: string | null): SQL {
  const simulated = eq(ledgerEventsTable.source, "simulated");
  const own = viewer ? eq(ledgerEventsTable.viewerId, viewer) : isNull(ledgerEventsTable.viewerId);
  return or(ne(ledgerEventsTable.source, "simulated"), and(simulated, own))!;
}

export async function listEvents(address: string): Promise<LedgerEventInput[]> {
  const rows = await db
    .select()
    .from(ledgerEventsTable)
    .where(and(eq(ledgerEventsTable.address, address), visibleTo(currentViewer())))
    .orderBy(asc(ledgerEventsTable.blockTime), asc(ledgerEventsTable.sequence));
  return rows.map(rowToEvent);
}

export async function countEvents(address: string, source?: string): Promise<number> {
  const scope = source ? and(eq(ledgerEventsTable.address, address), eq(ledgerEventsTable.source, source)) : eq(ledgerEventsTable.address, address);
  const rows = await db
    .select({ id: ledgerEventsTable.id })
    .from(ledgerEventsTable)
    .where(and(scope, visibleTo(currentViewer())));
  return rows.length;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function replaceEvents(address: string, events: LedgerEventInput[], keepSource?: string): Promise<void> {
  await db.transaction((tx) => replaceEventsIn(tx, address, events, keepSource));
}

async function replaceEventsIn(tx: Tx, address: string, events: LedgerEventInput[], keepSource?: string): Promise<void> {
  {
    if (keepSource) {
      const rows = await tx.select().from(ledgerEventsTable).where(eq(ledgerEventsTable.address, address));
      const drop = rows.filter((r) => r.source !== keepSource).map((r) => r.id);
      for (const id of drop) await tx.delete(ledgerEventsTable).where(eq(ledgerEventsTable.id, id));
    } else {
      await tx.delete(ledgerEventsTable).where(eq(ledgerEventsTable.address, address));
    }
    if (events.length > 0) {
      const rows = events.map((e, i) => eventToRow(address, e, i));
      for (let i = 0; i < rows.length; i += 200) {
        await tx.insert(ledgerEventsTable).values(rows.slice(i, i + 200)).onConflictDoNothing();
      }
    }
  }
}

/**
 * Writes progress for the run identified by `token`. Returns the row, or undefined when the run
 * has been taken over, in which case the caller must stop writing.
 */
export async function updateOwnedRun(address: string, token: string, values: Partial<Wallet>): Promise<Wallet | undefined> {
  const rows = await db
    .update(walletsTable)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(walletsTable.address, address), eq(walletsTable.runToken, token)))
    .returning();
  return rows[0];
}

/**
 * Lands the result of an index run: the ledger and the final wallet row in one transaction, only
 * if the run still owns the wallet. A run that lost the wallet to a takeover gets undefined and
 * leaves the ledger untouched.
 */
export async function finishOwnedRun(address: string, token: string, events: LedgerEventInput[], values: Partial<Wallet>, keepSource?: string): Promise<Wallet | undefined> {
  return db.transaction(async (tx) => {
    const owner = await tx.select({ runToken: walletsTable.runToken }).from(walletsTable).where(eq(walletsTable.address, address)).for("update");
    if (owner[0]?.runToken !== token) return undefined;
    await replaceEventsIn(tx, address, events, keepSource);
    const rows = await tx
      .update(walletsTable)
      .set({ ...values, runToken: null, updatedAt: new Date() })
      .where(eq(walletsTable.address, address))
      .returning();
    return rows[0];
  });
}

/** Records one event. A simulated event is stored under the viewer that recorded it. */
export async function insertEvent(address: string, e: LedgerEventInput, viewerId: string | null = null): Promise<void> {
  await db
    .insert(ledgerEventsTable)
    .values({ ...eventToRow(address, e, 0), viewerId })
    .onConflictDoNothing();
}

/** Deletes the current viewer's events of one source. Used to clear simulated sales. */
export async function deleteEventsBySource(address: string, source: string): Promise<number> {
  const viewer = currentViewer();
  const rows = await db
    .delete(ledgerEventsTable)
    .where(
      and(
        eq(ledgerEventsTable.address, address),
        eq(ledgerEventsTable.source, source),
        viewer ? eq(ledgerEventsTable.viewerId, viewer) : isNull(ledgerEventsTable.viewerId),
      ),
    )
    .returning({ id: ledgerEventsTable.id });
  return rows.length;
}

export async function deleteWallet(address: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(ledgerEventsTable).where(eq(ledgerEventsTable.address, address));
    await tx.delete(tradeQuotesTable).where(eq(tradeQuotesTable.address, address));
    await tx.delete(walletsTable).where(eq(walletsTable.address, address));
  });
}

export async function listMultiplierObservations(mints: string[]): Promise<MultiplierObservation[]> {
  if (mints.length === 0) return [];
  const rows = await db.select().from(multiplierObservationsTable).orderBy(asc(multiplierObservationsTable.observedAt));
  const wanted = new Set(mints);
  return rows
    .filter((r) => wanted.has(r.mint))
    .map((r) => ({
      mint: r.mint,
      multiplier: r.multiplier,
      pendingMultiplier: r.pendingMultiplier,
      pendingEffectiveAt: r.pendingEffectiveAt,
      observedAt: r.observedAt,
      source: r.source as MultiplierObservation["source"],
    }));
}

/** Records a multiplier when it differs from the latest stored value for the mint. */
export async function recordMultiplier(obs: MultiplierObservation): Promise<void> {
  const latest = await db
    .select()
    .from(multiplierObservationsTable)
    .where(eq(multiplierObservationsTable.mint, obs.mint))
    .orderBy(desc(multiplierObservationsTable.observedAt))
    .limit(1);
  const last = latest[0];
  if (
    last &&
    last.multiplier === obs.multiplier &&
    (last.pendingMultiplier ?? null) === (obs.pendingMultiplier ?? null)
  ) {
    return;
  }
  await db.insert(multiplierObservationsTable).values({
    mint: obs.mint,
    multiplier: obs.multiplier,
    pendingMultiplier: obs.pendingMultiplier,
    pendingEffectiveAt: obs.pendingEffectiveAt,
    observedAt: obs.observedAt,
    source: obs.source,
  });
}

export async function recordPrices(rows: Array<{ mint: string; price: number; referencePrice: number | null; source: string; observedAt: Date }>): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(priceObservationsTable).values(rows);
}

/** Stores a statement under the viewer that generated it. */
export async function insertStatement(values: InsertStatement): Promise<StatementRow> {
  const rows = await db
    .insert(statementsTable)
    .values({ ...values, viewerId: currentViewer() })
    .returning();
  return rows[0];
}

export async function getStatement(id: string): Promise<StatementRow | undefined> {
  const rows = await db.select().from(statementsTable).where(eq(statementsTable.id, id)).limit(1);
  return rows[0];
}

/** Statements generated in this browser, plus any that belong to every viewer of the wallet. */
export async function listStatements(address: string): Promise<StatementRow[]> {
  const viewer = currentViewer();
  const mine = viewer ? or(isNull(statementsTable.viewerId), eq(statementsTable.viewerId, viewer))! : isNull(statementsTable.viewerId);
  return db
    .select()
    .from(statementsTable)
    .where(and(eq(statementsTable.address, address), mine))
    .orderBy(desc(statementsTable.generatedAt));
}

export async function updateStatementProof(id: string, proof: Record<string, unknown>): Promise<void> {
  await db.update(statementsTable).set({ proof }).where(eq(statementsTable.id, id));
}

export async function insertTradeQuote(values: InsertTradeQuote): Promise<TradeQuoteRow> {
  const rows = await db.insert(tradeQuotesTable).values(values).returning();
  return rows[0];
}

export async function getTradeQuote(id: string): Promise<TradeQuoteRow | undefined> {
  const rows = await db.select().from(tradeQuotesTable).where(eq(tradeQuotesTable.id, id)).limit(1);
  return rows[0];
}

export async function updateTradeQuoteStatus(id: string, status: string): Promise<void> {
  await db.update(tradeQuotesTable).set({ status }).where(eq(tradeQuotesTable.id, id));
}

/** Records the first signature sent for a quote. Returns false when a different signature is already bound. */
export async function bindTradeQuoteSignature(id: string, signature: string): Promise<boolean> {
  const updated = await db
    .update(tradeQuotesTable)
    .set({ status: "submitted", signature })
    .where(and(eq(tradeQuotesTable.id, id), or(isNull(tradeQuotesTable.signature), eq(tradeQuotesTable.signature, signature))))
    .returning({ id: tradeQuotesTable.id });
  return updated.length > 0;
}
