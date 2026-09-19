import { pgTable, text, doublePrecision, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradeQuotesTable = pgTable("trade_quotes", {
  id: text("id").primaryKey(),
  address: text("address").notNull(),
  mint: text("mint").notNull(),
  rawAmount: text("raw_amount").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  quote: jsonb("quote").$type<Record<string, unknown>>().notNull(),
  routeQuote: jsonb("route_quote").$type<Record<string, unknown>>(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const insertTradeQuoteSchema = createInsertSchema(tradeQuotesTable).omit({ createdAt: true });
export type InsertTradeQuote = z.infer<typeof insertTradeQuoteSchema>;
export type TradeQuoteRow = typeof tradeQuotesTable.$inferSelect;
