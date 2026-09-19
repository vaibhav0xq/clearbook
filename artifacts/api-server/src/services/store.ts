import { and, asc, desc, eq } from "drizzle-orm";
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

export async function listEvents(address: string): Promise<LedgerEventInput[]> {
  const rows = await db
    .select()
    .from(ledgerEventsTable)
    .where(eq(ledgerEventsTable.address, address))
    .orderBy(asc(ledgerEventsTable.blockTime), asc(ledgerEventsTable.sequence));
  return rows.map(rowToEvent);
}

export async function countEvents(address: string, source?: string): Promise<number> {
  const rows = await db
    .select({ id: ledgerEventsTable.id })
    .from(ledgerEventsTable)
    .where(source ? and(eq(ledgerEventsTable.address, address), eq(ledgerEventsTable.source, source)) : eq(ledgerEventsTable.address, address));
  return rows.length;
}

export async function replaceEvents(address: string, events: LedgerEventInput[], keepSource?: string): Promise<void> {
  await db.transaction(async (tx) => {
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
  });
}

export async function insertEvent(address: string, e: LedgerEventInput): Promise<void> {
  await db.insert(ledgerEventsTable).values(eventToRow(address, e, 0)).onConflictDoNothing();
}

export async function deleteEventsBySource(address: string, source: string): Promise<number> {
  const rows = await db
    .delete(ledgerEventsTable)
    .where(and(eq(ledgerEventsTable.address, address), eq(ledgerEventsTable.source, source)))
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

export async function insertStatement(values: InsertStatement): Promise<StatementRow> {
  const rows = await db.insert(statementsTable).values(values).returning();
  return rows[0];
}

export async function getStatement(id: string): Promise<StatementRow | undefined> {
  const rows = await db.select().from(statementsTable).where(eq(statementsTable.id, id)).limit(1);
  return rows[0];
}

export async function listStatements(address: string): Promise<StatementRow[]> {
  return db.select().from(statementsTable).where(eq(statementsTable.address, address)).orderBy(desc(statementsTable.generatedAt));
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
