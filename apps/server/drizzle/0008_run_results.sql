CREATE TABLE "run_result_players" (
	"run_id" uuid NOT NULL,
	"seat" text NOT NULL,
	"account_id" uuid,
	"slot" integer NOT NULL,
	"loadout" text NOT NULL,
	"waves_in" integer NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "run_result_players_pk" PRIMARY KEY("run_id","seat")
);
--> statement-breakpoint
CREATE TABLE "run_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"district" text NOT NULL,
	"seed" bigint NOT NULL,
	"player_count" integer DEFAULT 0 NOT NULL,
	"wave_reached" integer DEFAULT 0 NOT NULL,
	"extracted" boolean DEFAULT false NOT NULL,
	"ending" text,
	"endless" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"nights_played" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "run_results_ending" CHECK ("run_results"."ending" is null or "run_results"."ending" in ('wiped', 'extracted', 'lost', 'abandoned'))
);
--> statement-breakpoint
ALTER TABLE "run_result_players" ADD CONSTRAINT "run_result_players_run_id_run_results_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_result_players" ADD CONSTRAINT "run_result_players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_result_players_account_idx" ON "run_result_players" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "run_results_ended_idx" ON "run_results" USING btree ("ended_at");