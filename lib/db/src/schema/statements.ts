import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const statementsTable = pgTable(
  "statements",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    title: text("title").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    method: text("method").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    hash: text("hash").notNull(),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    proof: jsonb("proof").$type<Record<string, unknown>>(),
    /** The browser session that generated the statement. Null for statements that belong to every viewer of the wallet. */
    viewerId: text("viewer_id"),
  },
  (table) => [index("statements_address_idx").on(table.address, table.generatedAt)],
);

export const insertStatementSchema = createInsertSchema(statementsTable);
export type InsertStatement = z.infer<typeof insertStatementSchema>;
export type StatementRow = typeof statementsTable.$inferSelect;
