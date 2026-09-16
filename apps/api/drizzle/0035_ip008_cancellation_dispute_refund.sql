-- IP-008 — Cancellation, Dispute & Refund.
-- Dá consequência FINANCEIRA real a dois fluxos que hoje só mudam estado:
-- cancelamento de pedido (MRK-018) antes da execução, e resolução de disputa
-- (MRK-024), que até esta IP só penalizava Trust Score (INCONSISTENCIAS #13).
--
-- Aditiva e não destrutiva: CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD
-- COLUMN IF NOT EXISTS / índices condicionais / FK condicionais. Reexecutável,
-- mesmo estilo de 0025..0029. NADA aqui altera o significado de uma coluna
-- existente — `trust_custodies`/`incremental_trust_custodies` ganham apenas um
-- NOVO valor possível (`REFUNDED`) na mesma coluna `status varchar`, sem
-- CHECK constraint para alterar (confirmado: nenhuma das duas tabelas tem um
-- CHECK enumerando os valores permitidos).

-- 1) Reembolsos (PAY-006). UNIQUE(idempotency_key) é a garantia final contra
-- reembolso duplicado — a chave é determinística por gatilho de negócio
-- (refund:cancel:{orderId}, refund:cancel:incremental:{changeOrderId},
-- refund:dispute:{decisionId}), nunca fornecida livremente por um cliente.
CREATE TABLE IF NOT EXISTS "funds_refunds" (
  "id" uuid PRIMARY KEY NOT NULL,
  "payment_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "amount" numeric(18, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "reason" varchar(60) NOT NULL,
  "reason_detail" text,
  "requested_by" uuid NOT NULL,
  "dispute_id" uuid,
  "status" varchar(30) NOT NULL,
  "provider_id" varchar(60) NOT NULL,
  "idempotency_key" varchar(120) NOT NULL,
  "provider_refund_id" varchar(200),
  "provider_code" varchar(100),
  "message" text,
  "gateway_response" jsonb DEFAULT '{}' NOT NULL,
  "requested_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'funds_refunds_payment_id_payments_id_fk'
  ) THEN
    ALTER TABLE "funds_refunds" ADD CONSTRAINT "funds_refunds_payment_id_payments_id_fk"
      FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'funds_refunds_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "funds_refunds" ADD CONSTRAINT "funds_refunds_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'funds_refunds_requested_by_identities_id_fk'
  ) THEN
    ALTER TABLE "funds_refunds" ADD CONSTRAINT "funds_refunds_requested_by_identities_id_fk"
      FOREIGN KEY ("requested_by") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  -- Sem FK para "dispute_id": Payments não pode depender do schema do
  -- Marketplace (PACK-01 §10 — a única direção permitida é leitura via porta,
  -- nunca FK cruzando módulo). Só rastreabilidade/auditoria.
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_funds_refund_idempotency" ON "funds_refunds" ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funds_refund_payment" ON "funds_refunds" ("payment_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funds_refund_order" ON "funds_refunds" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funds_refund_status" ON "funds_refunds" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funds_refund_dispute" ON "funds_refunds" ("dispute_id");
--> statement-breakpoint

-- 2) A decisão de disputa ganha um valor de reembolso EXPLÍCITO, digitado
-- pelo administrador (nunca calculado de decisionType — ver
-- marketplace-dispute.ts). NULL = decisão sem consequência financeira, o caso
-- mais comum hoje (INCONSISTENCIAS #13: só existia consequência de Trust
-- Score antes desta IP).
ALTER TABLE "marketplace_dispute_decisions" ADD COLUMN IF NOT EXISTS "refund_amount" numeric(18, 2);
--> statement-breakpoint

-- 3) `trust_custodies`/`incremental_trust_custodies`: nenhuma mudança de
-- schema é necessária para o novo status `REFUNDED` — a coluna já é
-- `varchar(30)` sem CHECK constraint (mesma coluna que já aceita
-- IN_CUSTODY/READY_FOR_RELEASE/RELEASED). Documentado aqui só para o leitor
-- da migration não procurar um ALTER que não existe por não ser necessário.
