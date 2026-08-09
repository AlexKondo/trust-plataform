CREATE TABLE "awarded_badges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_passport_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trust_badges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"badge_type" varchar(20) NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_profile_access_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"share_id" uuid NOT NULL,
	"trust_passport_id" uuid NOT NULL,
	"accessed_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "trust_profile_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_passport_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_visibility_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_passport_id" uuid NOT NULL,
	"show_score" boolean DEFAULT true NOT NULL,
	"show_level" boolean DEFAULT true NOT NULL,
	"show_badges" boolean DEFAULT true NOT NULL,
	"show_verifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "awarded_badges" ADD CONSTRAINT "awarded_badges_trust_passport_id_trust_passports_id_fk" FOREIGN KEY ("trust_passport_id") REFERENCES "public"."trust_passports"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "awarded_badges" ADD CONSTRAINT "awarded_badges_badge_id_trust_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."trust_badges"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "trust_profile_access_logs" ADD CONSTRAINT "trust_profile_access_logs_share_id_trust_profile_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."trust_profile_shares"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "trust_profile_shares" ADD CONSTRAINT "trust_profile_shares_trust_passport_id_trust_passports_id_fk" FOREIGN KEY ("trust_passport_id") REFERENCES "public"."trust_passports"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "trust_visibility_policies" ADD CONSTRAINT "trust_visibility_policies_trust_passport_id_trust_passports_id_fk" FOREIGN KEY ("trust_passport_id") REFERENCES "public"."trust_passports"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "idx_awarded_badge_passport" ON "awarded_badges" USING btree ("trust_passport_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_awarded_badge_active" ON "awarded_badges" USING btree ("trust_passport_id","badge_id") WHERE "awarded_badges"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trust_badge_code" ON "trust_badges" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_profile_access_share" ON "trust_profile_access_logs" USING btree ("share_id","accessed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_profile_share_token" ON "trust_profile_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_profile_share_passport" ON "trust_profile_shares" USING btree ("trust_passport_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_visibility_passport" ON "trust_visibility_policies" USING btree ("trust_passport_id");