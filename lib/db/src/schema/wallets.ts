import { pgTable, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const walletsTable = pgTable("wallets", {
  address: text("address").primaryKey(),
  isDemo: boolean("is_demo").notNull().default(false),
  state: text("state").notNull().default("not_indexed"),
  /** Identifies the process that owns the current index run. Its writes must carry the same token. */
  runToken: text("run_token"),
  source: text("source").notNull().default("live"),
  message: text("message").notNull().default(""),
  eventsIndexed: integer("events_indexed").notNull().default(0),
  signaturesScanned: integer("signatures_scanned").notNull().default(0),
  unknownTransactions: integer("unknown_transactions").notNull().default(0),
  lastSignature: text("last_signature"),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWalletSchema = createInsertSchema(walletsTable).omit({ createdAt: true, updatedAt: true });
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;
