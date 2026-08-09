CREATE TABLE "marketplace_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"minimum_trust_level" varchar(30),
	"minimum_score" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"status" varchar(30) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"close_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_listing_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"url" varchar(1000) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"listing_type" varchar(30),
	"category_id" uuid,
	"price" numeric(18, 2),
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"location" varchar(160),
	"status" varchar(30) NOT NULL,
	"published_at" timestamp with time zone,
	"view_count" bigint DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "marketplace_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_conversations" ADD CONSTRAINT "marketplace_conversations_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_conversations" ADD CONSTRAINT "marketplace_conversations_seller_id_identities_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_conversations" ADD CONSTRAINT "marketplace_conversations_buyer_id_identities_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_listing_images" ADD CONSTRAINT "marketplace_listing_images_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_owner_id_identities_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_category_id_marketplace_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."marketplace_categories"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_conversation_id_marketplace_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."marketplace_conversations"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_sender_id_identities_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_marketplace_category_code" ON "marketplace_categories" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_marketplace_conversation_listing" ON "marketplace_conversations" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_conversation_seller" ON "marketplace_conversations" USING btree ("seller_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_conversation_buyer" ON "marketplace_conversations" USING btree ("buyer_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_conversation_status" ON "marketplace_conversations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_marketplace_conversation_active" ON "marketplace_conversations" USING btree ("listing_id","seller_id","buyer_id") WHERE "marketplace_conversations"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_image" ON "marketplace_listing_images" USING btree ("listing_id","position");--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_owner" ON "marketplace_listings" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_category" ON "marketplace_listings" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_status" ON "marketplace_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_type" ON "marketplace_listings" USING btree ("listing_type");--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_price" ON "marketplace_listings" USING btree ("price");--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_published" ON "marketplace_listings" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_views" ON "marketplace_listings" USING btree ("view_count");--> statement-breakpoint
CREATE INDEX "idx_marketplace_listing_search" ON "marketplace_listings" USING btree ("status","category_id","published_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_message_conversation" ON "marketplace_messages" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_message_sender" ON "marketplace_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_message_unread" ON "marketplace_messages" USING btree ("conversation_id","read");