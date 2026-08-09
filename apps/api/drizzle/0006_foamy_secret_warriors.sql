CREATE TABLE "processed_events" (
	"consumer_name" varchar(120) NOT NULL,
	"event_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_consumer_name_event_id_pk" PRIMARY KEY("consumer_name","event_id")
);
--> statement-breakpoint
CREATE TABLE "trust_passports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"status" varchar(30) NOT NULL,
	"profile_completion" numeric(5, 2) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"document_verified" boolean DEFAULT false NOT NULL,
	"address_verified" boolean DEFAULT false NOT NULL,
	"phone" varchar(30),
	"address_country" varchar(2),
	"address_state" varchar(60),
	"address_city" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trust_passports" ADD CONSTRAINT "trust_passports_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trust_passport_identity" ON "trust_passports" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_trust_passport_status" ON "trust_passports" USING btree ("status");