ALTER TABLE "otp_codes" ADD COLUMN "table_id" integer;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "waiter_code" text;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;