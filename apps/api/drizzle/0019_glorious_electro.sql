CREATE TABLE "marketplace_dispute_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dispute_id" uuid NOT NULL,
	"decided_by" uuid NOT NULL,
	"decision_type" varchar(50) NOT NULL,
	"justification" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_disputes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"opened_by" uuid NOT NULL,
	"category" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(30) NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"decision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_review_scores" (
	"review_id" uuid NOT NULL,
	"criterion" varchar(100) NOT NULL,
	"score" smallint NOT NULL,
	CONSTRAINT "marketplace_review_scores_review_id_criterion_pk" PRIMARY KEY("review_id","criterion")
);
--> statement-breakpoint
CREATE TABLE "marketplace_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewed_user_id" uuid NOT NULL,
	"overall_score" smallint NOT NULL,
	"recommended" boolean,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_dispute_decisions" ADD CONSTRAINT "marketplace_dispute_decisions_dispute_id_marketplace_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."marketplace_disputes"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_dispute_decisions" ADD CONSTRAINT "marketplace_dispute_decisions_decided_by_identities_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_disputes" ADD CONSTRAINT "marketplace_disputes_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_disputes" ADD CONSTRAINT "marketplace_disputes_opened_by_identities_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_review_scores" ADD CONSTRAINT "marketplace_review_scores_review_id_marketplace_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."marketplace_reviews"("id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_reviewer_id_identities_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_reviewed_user_id_identities_id_fk" FOREIGN KEY ("reviewed_user_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_marketplace_decision_dispute" ON "marketplace_dispute_decisions" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_decision_at" ON "marketplace_dispute_decisions" USING btree ("decided_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_dispute_order" ON "marketplace_disputes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_dispute_status" ON "marketplace_disputes" USING btree ("status","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_marketplace_dispute_active" ON "marketplace_disputes" USING btree ("order_id") WHERE "marketplace_disputes"."status" in ('OPEN', 'IN_ANALYSIS', 'MEDIATION');--> statement-breakpoint
CREATE UNIQUE INDEX "idx_marketplace_review_order_reviewer" ON "marketplace_reviews" USING btree ("order_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_review_reviewed" ON "marketplace_reviews" USING btree ("reviewed_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_marketplace_review_score" ON "marketplace_reviews" USING btree ("overall_score");