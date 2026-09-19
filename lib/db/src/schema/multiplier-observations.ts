import { pgTable, text, serial, doublePrecision, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const multiplierObservationsTable = pgTable(
  "multiplier_observations",
  {
    id: serial("id").primaryKey(),
    mint: text("mint").notNull(),
    multiplier: doublePrecision("multiplier").notNull(),
    pendingMultiplier: doublePrecision("pending_multiplier"),
    pendingEffectiveAt: timestamp("pending_effective_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull(),
  },
  (table) => [index("multiplier_observations_mint_idx").on(table.mint, table.observedAt)],
);

export const insertMultiplierObservationSchema = createInsertSchema(multiplierObservationsTable).omit({ id: true });
export type InsertMultiplierObservation = z.infer<typeof insertMultiplierObservationSchema>;
export type MultiplierObservationRow = typeof multiplierObservationsTable.$inferSelect;
