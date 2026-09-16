-- IP-005 — Scheduling, Availability, Location & ETA.
-- Fecha três gaps confirmados no preflight: (1) reagendamento — a própria
-- INCONSISTENCIAS #26 já previa este exato caminho desde o MVP: "se
-- reagendamento entrar, trocar UNIQUE(order_id) por
-- UNIQUE(order_id) WHERE status = 'ACTIVE'"; (2) disponibilidade declarada do
-- Partner — não existia NENHUMA tabela/entidade de "quando eu costumo estar
-- disponível" em todo o repositório antes desta IP (só conflito reativo
-- entre agendamentos já confirmados, MRK-019 BR-004); (3) status de
-- deslocamento/ETA — modelo de transição declarada ("saí"/"cheguei"), nunca
-- rastreamento contínuo de GPS (nenhum fornecedor de mapas está configurado,
-- .env.example confirmado sem nenhuma chave de geocoding/roteamento).
-- Aditiva e não destrutiva: nenhuma linha existente é apagada ou reescrita;
-- mesmo estilo de 0024..0032 (CREATE TABLE IF NOT EXISTS / FK condicional /
-- índices condicionais / colunas novas sempre NULLABLE).

-- 1) Reagendamento (MRK-019 + IP-005): troca a constraint de UNIQUE(order_id)
-- para UNIQUE(order_id) WHERE status = 'ACTIVE' — um pedido pode acumular
-- várias linhas históricas CANCELLED (uma por reagendamento), mas nunca mais
-- de uma ACTIVE ao mesmo tempo. `cancelled_reason` é NULLABLE e só é
-- preenchido quando a causa foi um reagendamento (cancelamento do pedido
-- inteiro continua gravando NULL, comportamento pré-IP-005 inalterado).
ALTER TABLE "marketplace_order_schedulings" ADD COLUMN IF NOT EXISTS "cancelled_reason" text;
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_marketplace_scheduling_order";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_scheduling_order_active" ON "marketplace_order_schedulings" ("order_id") WHERE status = 'ACTIVE';
--> statement-breakpoint

-- 2) Disponibilidade declarada do Partner (ver partner-availability.ts).
-- Janela semanal recorrente por dia — deliberadamente sem exceções por
-- data/feriado, o mínimo seguro que fecha o gap sem inventar um calendário
-- completo. Mutável por design: representa a preferência CORRENTE, não um
-- fato histórico imutável.
CREATE TABLE IF NOT EXISTS "marketplace_partner_availability_windows" (
  "id" uuid PRIMARY KEY NOT NULL,
  "partner_id" uuid NOT NULL,
  "day_of_week" smallint NOT NULL,
  "start_minute" smallint NOT NULL,
  "end_minute" smallint NOT NULL,
  "timezone" varchar(50) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'marketplace_partner_availability_windows_partner_id_identities_id_fk'
  ) THEN
    ALTER TABLE "marketplace_partner_availability_windows" ADD CONSTRAINT "marketplace_partner_availability_windows_partner_id_identities_id_fk"
      FOREIGN KEY ("partner_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_partner_availability_partner" ON "marketplace_partner_availability_windows" ("partner_id", "day_of_week");
--> statement-breakpoint

-- 3) Status de deslocamento/ETA (ver order-travel-status.ts). UNIQUE(order_id):
-- um pedido tem no máximo UM registro vivo, mutado em lugar
-- (NOT_STARTED -> EN_ROUTE -> ARRIVED). Deliberadamente NENHUMA coluna de
-- latitude/longitude aqui — a justificativa de privacidade completa está em
-- marketplace-types.ts §TRAVEL_STATUS. O check-in/check-out do MRK-020/021
-- (marketplace_order_execution_events, migration 0017) continua sendo o
-- único lugar do sistema com coordenadas reais; esta tabela não adiciona
-- nenhuma coordenada nova, só um enum de 3 estados + uma estimativa de
-- minutos declarada pelo próprio Partner.
CREATE TABLE IF NOT EXISTS "marketplace_order_travel_statuses" (
  "id" uuid PRIMARY KEY NOT NULL,
  "order_id" uuid NOT NULL,
  "status" varchar(20) NOT NULL,
  "declared_eta_minutes" integer,
  "estimated_arrival_at" timestamp with time zone,
  "eta_source" varchar(30),
  "en_route_at" timestamp with time zone,
  "arrived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'marketplace_order_travel_statuses_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "marketplace_order_travel_statuses" ADD CONSTRAINT "marketplace_order_travel_statuses_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_order_travel_status_order" ON "marketplace_order_travel_statuses" ("order_id");
