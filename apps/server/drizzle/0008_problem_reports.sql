CREATE TABLE "problem_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"note" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_reports_created_idx" ON "problem_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "problem_reports_account_created_idx" ON "problem_reports" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "problem_reports_code_idx" ON "problem_reports" USING btree ("code");