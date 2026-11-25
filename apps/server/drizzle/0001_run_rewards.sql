CREATE TABLE "run_rewards" (
	"run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"supplies" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_rewards_pk" PRIMARY KEY("run_id","account_id"),
	CONSTRAINT "run_rewards_supplies_nonneg" CHECK ("run_rewards"."supplies" >= 0)
);
--> statement-breakpoint
ALTER TABLE "run_rewards" ADD CONSTRAINT "run_rewards_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;