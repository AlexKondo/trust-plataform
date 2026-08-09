CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identity_id" uuid,
	"operation" varchar(120) NOT NULL,
	"resource" varchar(120) NOT NULL,
	"resource_id" varchar(120),
	"result" varchar(30) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"correlation_id" uuid,
	"request_id" uuid,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"event_name" varchar(120) NOT NULL,
	"event_version" varchar(10) DEFAULT '1.0' NOT NULL,
	"producer" varchar(60) NOT NULL,
	"correlation_id" uuid,
	"causation_id" uuid,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_audit_log_identity" ON "audit_logs" USING btree ("identity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_operation" ON "audit_logs" USING btree ("operation","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_correlation" ON "audit_logs" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_outbox_event_event_id" ON "outbox_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_outbox_event_pending" ON "outbox_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_outbox_event_name" ON "outbox_events" USING btree ("event_name","occurred_at");