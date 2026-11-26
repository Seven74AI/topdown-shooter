CREATE TABLE "paid_bags" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress" ADD COLUMN "settings" jsonb;