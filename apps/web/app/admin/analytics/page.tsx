'use client';

import { useEffect, useState } from 'react';
import { AdminOnly } from '../../../components/admin-guard';
import { AppShell } from '../../../components/app-shell';
import { Card, ErrorState, Loading, PageHeader, SectionTitle } from '../../../components/layout';
import { ApiError, authApi } from '../../../lib/api';
import { LEVEL_LABEL } from '../../../lib/labels';

interface Overview {
  range: { from: string; to: string };
  funnel: {
    requestsCreated: number;
    requestsMatched: number;
    offersCreated: number;
    ordersCreated: number;
    executionCompleted: number;
    customerConfirmed: number;
    paymentsReleased: number;
    grossOrderValueCents: number;
    releasedCustodyValueCents: number;
  };
  conversion: {
    requestToMatch: number | null;
    offerToOrder: number | null;
    orderToExecution: number | null;
    executionToConfirmation: number | null;
    confirmationToPayment: number | null;
  };
  outcomes: {
    ordersCreated: number;
    completionRate: number | null;
    cancellationRate: number | null;
    disputeRate: number | null;
  };
  payments: {
    authorizationsAttempted: number;
    authorizationsApproved: number;
    paymentSuccessRate: number | null;
  };
  timing: { avgTimeToFirstOfferMinutes: number | null; avgPartnerResponseMinutes: number | null };
}

interface TrustAdoption {
  activeIdentities: number;
  identitiesWithPassport: number;
  passportAdoptionRate: number | null;
  documentVerifiedShare: number | null;
  levelDistribution: Array<{ level: string; count: number }>;
}

const centsToBRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

const pct = (rate: number | null) => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`);

const minutes = (value: number | null) => (value === null ? '—' : `${value.toFixed(0)} min`);

function FunnelRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/50 py-2 last:border-0">
      <span className="body-sm text-on-surface-variant">{label}</span>
      <span className="body-lg font-semibold text-on-surface">{value}</span>
    </div>
  );
}

function ConversionRow({ label, rate }: { label: string; rate: number | null }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/50 py-2 last:border-0">
      <span className="body-sm text-on-surface-variant">{label}</span>
      <span className="body-lg font-semibold text-teal">{pct(rate)}</span>
    </div>
  );
}

function AnalyticsContent() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [adoption, setAdoption] = useState<TrustAdoption | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      authApi<Overview>('/admin/analytics/overview'),
      authApi<TrustAdoption>('/admin/analytics/trust-adoption'),
    ])
      .then(([overviewData, adoptionData]) => {
        setOverview(overviewData);
        setAdoption(adoptionData);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as métricas.');
      });
  }, []);

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!overview || !adoption) {
    return <Loading label="Calculando métricas..." />;
  }

  const { funnel, conversion, outcomes, payments, timing } = overview;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Analytics & inteligência operacional"
        subtitle={`Janela: ${new Date(overview.range.from).toLocaleDateString('pt-BR')} – ${new Date(
          overview.range.to,
        ).toLocaleDateString('pt-BR')}. Todo número aqui é recalculado direto das tabelas reais — nada é um contador separado que possa divergir.`}
        back={{ href: '/admin', label: 'Moderação' }}
      />

      <Card padded={false}>
        <div className="border-b border-outline-variant p-6">
          <SectionTitle
            icon="filter_alt"
            title="Funil: pedido → proposta → contrato → execução → confirmação → pagamento"
            hint="Contagem de fatos de negócio na janela acima, um estágio por linha do catálogo de eventos."
          />
        </div>
        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          <div>
            <FunnelRow label="Pedidos de serviço criados" value={funnel.requestsCreated} />
            <FunnelRow label="Pedidos com Partner engajado" value={funnel.requestsMatched} />
            <FunnelRow label="Propostas criadas" value={funnel.offersCreated} />
            <FunnelRow label="Contratos (pedidos) criados" value={funnel.ordersCreated} />
            <FunnelRow label="Execuções concluídas" value={funnel.executionCompleted} />
            <FunnelRow label="Confirmações do cliente" value={funnel.customerConfirmed} />
            <FunnelRow label="Custódias liberadas" value={funnel.paymentsReleased} />
          </div>
          <div>
            <ConversionRow label="Pedido → Match" rate={conversion.requestToMatch} />
            <ConversionRow label="Proposta → Contrato" rate={conversion.offerToOrder} />
            <ConversionRow label="Contrato → Execução" rate={conversion.orderToExecution} />
            <ConversionRow label="Execução → Confirmação" rate={conversion.executionToConfirmation} />
            <ConversionRow label="Confirmação → Pagamento" rate={conversion.confirmationToPayment} />
            <div className="mt-4 flex flex-col gap-1 rounded-lg bg-surface-container p-3">
              <span className="body-sm text-on-surface-variant">Valor bruto dos contratos (GMV)</span>
              <span className="headline-md text-on-surface">{centsToBRL(funnel.grossOrderValueCents)}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1 rounded-lg bg-surface-container p-3">
              <span className="body-sm text-on-surface-variant">Valor liberado da custódia</span>
              <span className="headline-md text-on-surface">
                {centsToBRL(funnel.releasedCustodyValueCents)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <Card>
          <SectionTitle icon="task_alt" title="Desfechos" hint="Sobre pedidos criados na janela." />
          <ConversionRow label="Conclusão" rate={outcomes.completionRate} />
          <ConversionRow label="Cancelamento" rate={outcomes.cancellationRate} />
          <ConversionRow label="Disputa" rate={outcomes.disputeRate} />
        </Card>

        <Card>
          <SectionTitle icon="payments" title="Pagamento" hint="Sobre tentativas de autorização na janela." />
          <FunnelRow label="Tentativas" value={payments.authorizationsAttempted} />
          <FunnelRow label="Aprovadas" value={payments.authorizationsApproved} />
          <ConversionRow label="Taxa de sucesso" rate={payments.paymentSuccessRate} />
        </Card>

        <Card>
          <SectionTitle icon="schedule" title="Tempo de resposta" />
          <div className="flex items-center justify-between border-b border-outline-variant/50 py-2">
            <span className="body-sm text-on-surface-variant">Até a 1ª proposta</span>
            <span className="body-lg font-semibold text-on-surface">
              {minutes(timing.avgTimeToFirstOfferMinutes)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="body-sm text-on-surface-variant">Resposta do Partner</span>
            <span className="body-lg font-semibold text-on-surface">
              {minutes(timing.avgPartnerResponseMinutes)}
            </span>
          </div>
        </Card>
      </div>

      <Card padded={false}>
        <div className="border-b border-outline-variant p-6">
          <SectionTitle
            icon="verified_user"
            title="Adoção de Trust"
            hint="Estado atual (não é um período) — identidades excluídas (LGPD) não entram em nenhuma contagem."
          />
        </div>
        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          <div>
            <FunnelRow label="Identidades ativas" value={adoption.activeIdentities} />
            <FunnelRow label="Com Trust Passport" value={adoption.identitiesWithPassport} />
            <ConversionRow label="Adoção do Passport" rate={adoption.passportAdoptionRate} />
            <ConversionRow label="Documento verificado" rate={adoption.documentVerifiedShare} />
          </div>
          <div>
            {adoption.levelDistribution.map((row) => (
              <FunnelRow key={row.level} label={LEVEL_LABEL[row.level] ?? row.level} value={row.count} />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <AppShell>
      <AdminOnly>
        <AnalyticsContent />
      </AdminOnly>
    </AppShell>
  );
}
