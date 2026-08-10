CREATE TABLE "marketplace_confirmations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"confirmed_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"comments" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_order_execution_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"performed_by" uuid NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"accuracy" numeric(8, 2),
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_order_schedulings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"estimated_duration" integer NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"timezone" varchar(50) NOT NULL,
	"status" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ALTER COLUMN "status" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "started_by" uuid;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "completed_by" uuid;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "actual_duration" integer;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "customer_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "customer_confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "marketplace_confirmations" ADD CONSTRAINT "marketplace_confirmations_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_confirmations" ADD CONSTRAINT "marketplace_confirmations_confirmed_by_identities_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_order_execution_events" ADD CONSTRAINT "marketplace_order_execution_events_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_order_execution_events" ADD CONSTRAINT "marketplace_order_execution_events_performed_by_identities_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_order_schedulings" ADD CONSTRAINT "marketplace_order_schedulings_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_marketplace_confirmation_order" ON "marketplace_confirmations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_confirmation_at" ON "marketplace_confirmations" USING btree ("confirmed_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_execution_order" ON "marketplace_order_execution_events" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_execution_type" ON "marketplace_order_execution_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_marketplace_scheduling_order" ON "marketplace_order_schedulings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_scheduling_start" ON "marketplace_order_schedulings" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "idx_marketplace_scheduling_status" ON "marketplace_order_schedulings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_marketplace_order_listing" ON "marketplace_orders" USING btree ("listing_id");