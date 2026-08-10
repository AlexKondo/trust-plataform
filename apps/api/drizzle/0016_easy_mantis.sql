CREATE TABLE "marketplace_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"parent_offer_id" uuid,
	"amount" numeric(18, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"status" varchar(30) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"notes" text,
	"withdrew_at" timestamp with time zone,
	"withdrew_by" uuid,
	"withdraw_reason" text,
	"rejected_at" timestamp with time zone,
	"rejected_by" uuid,
	"reject_reason" text,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"status" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD CONSTRAINT "marketplace_offers_conversation_id_marketplace_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."marketplace_conversations"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD CONSTRAINT "marketplace_offers_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD CONSTRAINT "marketplace_offers_buyer_id_identities_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD CONSTRAINT "marketplace_offers_seller_id_identities_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD CONSTRAINT "marketplace_offers_created_by_identities_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD CONSTRAINT "marketplace_offers_parent_offer_id_marketplace_offers_id_fk" FOREIGN KEY ("parent_offer_id") REFERENCES "public"."marketplace_offers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_offer_id_marketplace_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."marketplace_offers"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_conversation_id_marketplace_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."marketplace_conversations"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_buyer_id_identities_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_seller_id_identities_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "idx_marketplace_offer_conversation" ON "marketplace_offers" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_offer_listing" ON "marketplace_offers" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_offer_buyer" ON "marketplace_offers" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_offer_seller" ON "marketplace_offers" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_offer_status" ON "marketplace_offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_marketplace_offer_expires" ON "marketplace_offers" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_offer_parent" ON "marketplace_offers" USING btree ("parent_offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_marketplace_order_offer" ON "marketplace_orders" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_order_buyer" ON "marketplace_orders" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_order_seller" ON "marketplace_orders" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_order_status" ON "marketplace_orders" USING btree ("status");