import { pgTable, text, serial, doublePrecision, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const priceObservationsTable = pgTable(
  "price_observations",
  {
    id: serial("id").primaryKey(),
    mint: text("mint").notNull(),
    price: doublePrecision("price").notNull(),
    referencePrice: doublePrecision("reference_price"),
    source: text("source").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("price_observations_mint_idx").on(table.mint, table.observedAt)],
);

export const insertPriceObservationSchema = createInsertSchema(priceObservationsTable).omit({ id: true });
export type InsertPriceObservation = z.infer<typeof insertPriceObservationSchema>;
export type PriceObservationRow = typeof priceObservationsTable.$inferSelect;
