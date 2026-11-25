CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text,
	"password_hash" text,
	"recovery_code_hash" text,
	"guest_token_hash" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_username_unique" UNIQUE("username"),
	CONSTRAINT "accounts_guest_token_hash_unique" UNIQUE("guest_token_hash")
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"supplies" integer DEFAULT 0 NOT NULL,
	"lifetime_supplies" integer DEFAULT 0 NOT NULL,
	"unlocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"training" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"districts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_supplies_nonneg" CHECK ("progress"."supplies" >= 0 AND "progress"."lifetime_supplies" >= 0)
);
--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;