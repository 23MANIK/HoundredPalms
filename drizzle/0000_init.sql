CREATE TYPE "public"."order_item_status" AS ENUM('active', 'unavailable', 'removed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'returned', 'approved', 'preparing', 'ready', 'served', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('waiter', 'kitchen', 'cashier', 'manager');--> statement-breakpoint
CREATE TYPE "public"."tab_status" AS ENUM('open', 'paid');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" integer,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"table_id" integer,
	"tab_id" integer,
	"order_id" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" integer NOT NULL,
	"number" integer NOT NULL,
	"seats" integer DEFAULT 4 NOT NULL,
	"qr_token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "dining_tables_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text,
	"google_sub" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "guests_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_paise" integer NOT NULL,
	"is_veg" boolean NOT NULL,
	"is_bestseller" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"in_stock" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"menu_item_id" integer NOT NULL,
	"name" text NOT NULL,
	"price_paise" integer NOT NULL,
	"is_veg" boolean NOT NULL,
	"qty" integer NOT NULL,
	"status" "order_item_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tab_id" integer NOT NULL,
	"table_id" integer NOT NULL,
	"guest_id" integer,
	"placed_by_staff_id" integer,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by_staff_id" integer,
	"approved_at" timestamp with time zone,
	"cancelled_by_staff_id" integer,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"ip" text,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"veg_only" boolean DEFAULT false NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"pin_hash" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "tabs" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_id" integer NOT NULL,
	"status" "tab_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bill_requested_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by_staff_id" integer,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	"gst_rate_bp" integer,
	"payment_method" text,
	"total_paise" integer
);
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tab_id_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."tabs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_staff_id_staff_id_fk" FOREIGN KEY ("placed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_approved_by_staff_id_staff_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_staff_id_staff_id_fk" FOREIGN KEY ("cancelled_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_closed_by_staff_id_staff_id_fk" FOREIGN KEY ("closed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_tab" ON "audit_log" USING btree ("tab_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_restaurant_number" ON "dining_tables" USING btree ("restaurant_id","number");--> statement-breakpoint
CREATE INDEX "orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_tab" ON "orders" USING btree ("tab_id");--> statement-breakpoint
CREATE INDEX "otp_codes_phone" ON "otp_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "otp_codes_ip" ON "otp_codes" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "tabs_table_status" ON "tabs" USING btree ("table_id","status");