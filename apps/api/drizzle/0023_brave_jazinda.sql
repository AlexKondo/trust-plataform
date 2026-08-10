CREATE TABLE "payment_authorizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"provider_id" varchar(60) NOT NULL,
	"idempotency_key" varchar(120) NOT NULL,
	"provider_transaction_id" varchar(200),
	"authorization_code" varchar(100),
	"authorized_amount" numeric(18, 2) NOT NULL,
	"status" varchar(30) NOT NULL,
	"provider_code" varchar(100),
	"message" text,
	"authorized_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"gateway_response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_authorizations" ADD CONSTRAINT "payment_authorizations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payment_authorization_idempotency" ON "payment_authorizations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_payment_authorization_payment" ON "payment_authorizations" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_authorization_transaction" ON "payment_authorizations" USING btree ("provider_transaction_id");--> statement-breakpoint
CREATE INDEX "idx_payment_authorization_status" ON "payment_authorizations" USING btree ("status");