import { pgTable, text, integer, bigint, doublePrecision, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ledgerEventsTable = pgTable(
  "ledger_events",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    signature: text("signature"),
    slot: bigint("slot", { mode: "number" }),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    kind: text("kind").notNull(),
    mint: text("mint").notNull(),
    rawDelta: text("raw_delta").notNull(),
    grossUsd: doublePrecision("gross_usd"),
    feeUsd: doublePrecision("fee_usd"),
    counterAsset: text("counter_asset"),
    counterAmount: doublePrecision("counter_amount"),
    multiplierAtEvent: doublePrecision("multiplier_at_event"),
    referencePriceUsd: doublePrecision("reference_price_usd"),
    source: text("source").notNull(),
    /** The browser session that recorded a simulated event. Null for events read from the chain or a demo script. */
    viewerId: text("viewer_id"),
    venue: text("venue"),
    note: text("note"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    sequence: integer("sequence").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ledger_events_address_idx").on(table.address, table.blockTime)],
);

export const insertLedgerEventSchema = createInsertSchema(ledgerEventsTable).omit({ createdAt: true });
export type InsertLedgerEvent = z.infer<typeof insertLedgerEventSchema>;
export type LedgerEventRow = typeof ledgerEventsTable.$inferSelect;
