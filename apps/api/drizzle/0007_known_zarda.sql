CREATE TABLE "verification_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"verification_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"decision" varchar(20) NOT NULL,
	"decision_source" varchar(30) NOT NULL,
	"reason_code" varchar(50),
	"comments" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_evidences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"verification_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"storage_key" varchar(300) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" bigint NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"verification_id" uuid NOT NULL,
	"review_type" varchar(30) NOT NULL,
	"status" varchar(20) NOT NULL,
	"reviewer_identity_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_passport_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"type" varchar(30) NOT NULL,
	"status" varchar(30) NOT NULL,
	"provider_id" uuid,
	"current_attempt" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_decisions" ADD CONSTRAINT "verification_decisions_verification_id_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verifications"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "verification_decisions" ADD CONSTRAINT "verification_decisions_review_id_verification_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."verification_reviews"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "verification_evidences" ADD CONSTRAINT "verification_evidences_verification_id_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verifications"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_verification_id_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verifications"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_trust_passport_id_trust_passports_id_fk" FOREIGN KEY ("trust_passport_id") REFERENCES "public"."trust_passports"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_verification_decision_unique" ON "verification_decisions" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "idx_verification_evidence_verification" ON "verification_evidences" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "idx_verification_evidence_type" ON "verification_evidences" USING btree ("verification_id","type");--> statement-breakpoint
CREATE INDEX "idx_verification_review_verification" ON "verification_reviews" USING btree ("verification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_verification_review_active" ON "verification_reviews" USING btree ("verification_id") WHERE "verification_reviews"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "idx_verification_passport_type_status" ON "verifications" USING btree ("trust_passport_id","type","status");--> statement-breakpoint
CREATE INDEX "idx_verification_identity" ON "verifications" USING btree ("identity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_verification_active_unique" ON "verifications" USING btree ("trust_passport_id","type") WHERE "verifications"."status" in ('WAITING_FOR_EVIDENCE', 'PENDING_REVIEW', 'IN_REVIEW');