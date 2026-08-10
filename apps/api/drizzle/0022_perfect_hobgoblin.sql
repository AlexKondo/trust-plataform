CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"status" varchar(30) NOT NULL,
	"payment_method_id" uuid,
	"payment_provider_id" varchar(60),
	"refunded_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_id_identities_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_seller_id_identities_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payment_order" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_payment_buyer" ON "payments" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_seller" ON "payments" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_status" ON "payments" USING btree ("status");