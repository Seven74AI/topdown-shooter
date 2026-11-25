CREATE TABLE "saved_run_players" (
	"saved_run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"seat_key" text NOT NULL,
	CONSTRAINT "saved_run_players_pk" PRIMARY KEY("saved_run_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "saved_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"district" text NOT NULL,
	"seed" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"wave" integer NOT NULL,
	"names" jsonb NOT NULL,
	"status" text NOT NULL,
	"room_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "saved_runs_status" CHECK ("saved_runs"."status" in ('open', 'saved'))
);
--> statement-breakpoint
ALTER TABLE "saved_run_players" ADD CONSTRAINT "saved_run_players_saved_run_id_saved_runs_id_fk" FOREIGN KEY ("saved_run_id") REFERENCES "public"."saved_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_run_players" ADD CONSTRAINT "saved_run_players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_run_players_account_idx" ON "saved_run_players" USING btree ("account_id");