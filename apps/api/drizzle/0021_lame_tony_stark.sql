CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"type" varchar(60) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"resource_type" varchar(60),
	"resource_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "idx_notification_identity" ON "notifications" USING btree ("identity_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_unread" ON "notifications" USING btree ("identity_id") WHERE "notifications"."read_at" is null;