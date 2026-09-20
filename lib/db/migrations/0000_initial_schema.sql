CREATE TABLE "wallets" (
	"address" text PRIMARY KEY NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'not_indexed' NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"events_indexed" integer DEFAULT 0 NOT NULL,
	"signatures_scanned" integer DEFAULT 0 NOT NULL,
	"unknown_transactions" integer DEFAULT 0 NOT NULL,
	"last_signature" text,
	"last_indexed_at" timestamp with time zone,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_events" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"signature" text,
	"slot" bigint,
	"block_time" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"mint" text NOT NULL,
	"raw_delta" text NOT NULL,
	"gross_usd" double precision,
	"fee_usd" double precision,
	"counter_asset" text,
	"counter_amount" double precision,
	"multiplier_at_event" double precision,
	"reference_price_usd" double precision,
	"source" text NOT NULL,
	"viewer_id" text,
	"venue" text,
	"note" text,
	"payload" jsonb,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multiplier_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"mint" text NOT NULL,
	"multiplier" double precision NOT NULL,
	"pending_multiplier" double precision,
	"pending_effective_at" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"mint" text NOT NULL,
	"price" double precision NOT NULL,
	"reference_price" double precision,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"title" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hash" text NOT NULL,
	"body" jsonb NOT NULL,
	"proof" jsonb,
	"viewer_id" text
);
--> statement-breakpoint
CREATE TABLE "trade_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"mint" text NOT NULL,
	"raw_amount" text NOT NULL,
	"quantity" double precision NOT NULL,
	"quote" jsonb NOT NULL,
	"route_quote" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ledger_events_address_idx" ON "ledger_events" USING btree ("address","block_time");--> statement-breakpoint
CREATE INDEX "multiplier_observations_mint_idx" ON "multiplier_observations" USING btree ("mint","observed_at");--> statement-breakpoint
CREATE INDEX "price_observations_mint_idx" ON "price_observations" USING btree ("mint","observed_at");--> statement-breakpoint
CREATE INDEX "statements_address_idx" ON "statements" USING btree ("address","generated_at");