CREATE TABLE "trust_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_passport_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"event_name" varchar(120) NOT NULL,
	"source_event_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"rule_id" uuid,
	"points" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_level_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_passport_id" uuid NOT NULL,
	"previous_level" varchar(30),
	"new_level" varchar(30) NOT NULL,
	"score" integer NOT NULL,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_level_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"level" varchar(30) NOT NULL,
	"min_score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"rank" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_score_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_name" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"points" integer NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_occurrences" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_passport_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"level" varchar(30) NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_trust_passport_id_trust_passports_id_fk" FOREIGN KEY ("trust_passport_id") REFERENCES "public"."trust_passports"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "trust_level_history" ADD CONSTRAINT "trust_level_history_trust_passport_id_trust_passports_id_fk" FOREIGN KEY ("trust_passport_id") REFERENCES "public"."trust_passports"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "trust_scores" ADD CONSTRAINT "trust_scores_trust_passport_id_trust_passports_id_fk" FOREIGN KEY ("trust_passport_id") REFERENCES "public"."trust_passports"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "trust_scores" ADD CONSTRAINT "trust_scores_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trust_event_source" ON "trust_events" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX "idx_trust_event_passport" ON "trust_events" USING btree ("trust_passport_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_trust_level_history_passport" ON "trust_level_history" USING btree ("trust_passport_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trust_level_rule_level" ON "trust_level_rules" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_trust_score_rule_event" ON "trust_score_rules" USING btree ("event_name","active");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trust_score_passport" ON "trust_scores" USING btree ("trust_passport_id");