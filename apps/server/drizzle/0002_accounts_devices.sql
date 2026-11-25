CREATE TABLE "device_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "username_lower" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "merged_into" uuid;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "save_nudged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_tokens_account_idx" ON "device_tokens" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_merged_into_accounts_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_username_lower_unique" UNIQUE("username_lower");
--> statement-breakpoint
-- Story 7.6 (AC 1): every guest token hash becomes its account's first device row before the column goes.
INSERT INTO "device_tokens" ("token_hash", "account_id", "created_at", "last_seen_at") SELECT "guest_token_hash", "id", "created_at", now() FROM "accounts";
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_guest_token_hash_unique";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "guest_token_hash";