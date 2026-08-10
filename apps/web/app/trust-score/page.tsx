'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import {
  Card,
  EmptyState,
  Loading,
  PageHeader,
  Pill,
  ScoreRing,
  SectionTitle,
  TrustLevelBadge,
} from '../../components/layout';
import { Icon } from '../../components/ui';
import { ApiError, authApi } from '../../lib/api';
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  LEVEL_RANGE,
  TRUST_EVENT_LABEL,
  formatDateTime,
} from '../../lib/labels';
import type { TrustBadge, TrustBenefit, TrustEventEntry, TrustScore } from '../../lib/types';

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return fallback;
    }
    throw error;
  }
}

function TrustScoreContent() {
  const [score, setScore] = useState<TrustScore | null>(null);
  const [timeline, setTimeline] = useState<TrustEventEntry[]>([]);
  const [badges, setBadges] = useState<TrustBadge[]>([]);
  const [benefits, setBenefits] = useState<TrustBenefit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [scoreData, timelineData, badgeData, benefitData] = await Promise.all([
        safe(authApi<TrustScore>('/trust-scores/me'), null),
        safe(authApi<TrustEventEntry[]>('/trust-scores/me/timeline'), []),
        safe(authApi<TrustBadge[]>('/trust-badges/me'), []),
        safe(authApi<TrustBenefit[]>('/trust-benefits/me'), []),
      ]);
      setScore(scoreData);
      setTimeline(timelineData);
      setBadges(badgeData);
      setBenefits(benefitData);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <Loading label="Calculando sua confiança..." />;
  }

  const current = score?.score ?? 0;
  const level = score?.level ?? 'UNVERIFIED';
  const levelIndex = LEVEL_ORDER.indexOf(level);
  const nextLevel = LEVEL_ORDER[levelIndex + 1];
  const missing = nextLevel ? (LEVEL_RANGE[nextLevel]?.min ?? 0) - current : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Trust Score"
        subtitle="Sua reputação é construída por fatos verificáveis — e cada ponto tem uma origem rastreável."
      />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <Card className="flex flex-col items-center justify-center gap-4 md:col-span-1">
          <ScoreRing score={current} level={level} />
          <TrustLevelBadge level={level} />
          {nextLevel && missing > 0 ? (
            <p className="body-sm text-center text-on-surface-variant">
              Faltam <strong className="text-on-surface">{missing} pontos</strong> para o nível{' '}
              {LEVEL_LABEL[nextLevel]}
            </p>
          ) : (
            <p className="body-sm text-center text-on-surface-variant">
              Você está no nível máximo da plataforma.
            </p>
          )}
        </Card>

        <Card className="md:col-span-2">
          <SectionTitle
            icon="stairs"
            title="Níveis de confiança"
            hint="Cada nível libera categorias e benefícios diferentes no marketplace."
          />
          <ul className="flex flex-col gap-2">
            {LEVEL_ORDER.map((name, index) => {
              const range = LEVEL_RANGE[name];
              const reached = index <= levelIndex;
              const isCurrent = index === levelIndex;
              return (
                <li
                  key={name}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    isCurrent
                      ? 'border-teal bg-secondary-container/30'
                      : 'border-outline-variant/60'
                  }`}
                >
                  <Icon
                    name={reached ? 'check_circle' : 'lock'}
                    filled={reached}
                    size={20}
                    className={reached ? 'text-teal' : 'text-outline-variant'}
                  />
                  <span
                    className={`body-lg flex-1 ${
                      isCurrent ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
                    }`}
                  >
                    {LEVEL_LABEL[name]}
                  </span>
                  <span className="body-sm text-on-surface-variant">
                    {range ? `${range.min}–${range.max}` : ''}
                  </span>
                  {isCurrent ? <Pill tone="success">Você está aqui</Pill> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Timeline explicável — o diferencial do produto */}
      <Card padded={false}>
        <div className="border-b border-outline-variant p-6">
          <h2 className="headline-md text-lg text-on-surface">Como seu score foi construído</h2>
          <p className="body-sm text-on-surface-variant">
            Todo ponto vem de um fato registrado. Nada é opinião do sistema.
          </p>
        </div>
        {timeline.length === 0 ? (
          <EmptyState
            icon="timeline"
            title="Seu histórico está vazio"
            description="Assim que sua conta for ativada e você fizer verificações, os eventos aparecem aqui."
          />
        ) : (
          <ul className="divide-y divide-outline-variant/50">
            {timeline.map((event, index) => (
              <li key={`${event.eventName}-${index}`} className="flex items-center gap-4 p-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    event.points > 0
                      ? 'bg-secondary-container text-teal'
                      : event.points < 0
                        ? 'bg-error-container text-error'
                        : 'bg-surface-container text-outline'
                  }`}
                >
                  <Icon
                    name={event.points > 0 ? 'add' : event.points < 0 ? 'remove' : 'info'}
                    size={20}
                  />
                </div>
                <div className="flex-1">
                  <p className="body-lg font-medium text-on-surface">
                    {TRUST_EVENT_LABEL[event.eventName] ?? event.eventName}
                  </p>
                  <p className="body-sm text-on-surface-variant">
                    {formatDateTime(event.occurredAt)}
                  </p>
                </div>
                <span
                  className={`headline-md text-lg ${
                    event.points > 0
                      ? 'text-teal'
                      : event.points < 0
                        ? 'text-error'
                        : 'text-outline'
                  }`}
                >
                  {event.points > 0 ? '+' : ''}
                  {event.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card>
          <SectionTitle icon="workspace_premium" title="Selos conquistados" />
          {badges.length === 0 ? (
            <p className="body-sm text-on-surface-variant">
              Você ainda não tem selos. Eles são concedidos automaticamente conforme sua pontuação
              cresce.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {badges.map((badge) => (
                <li key={badge.code} className="flex items-start gap-3">
                  <Icon name="workspace_premium" filled className="mt-0.5 text-teal" size={22} />
                  <div>
                    <p className="body-lg font-medium text-on-surface">{badge.name}</p>
                    <p className="body-sm text-on-surface-variant">{badge.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle icon="card_giftcard" title="Benefícios" hint="O que sua confiança libera." />
          {benefits.length === 0 ? (
            <p className="body-sm text-on-surface-variant">Nenhum benefício disponível ainda.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {benefits.map((benefit) => (
                <li key={benefit.name} className="flex items-start gap-3">
                  <Icon
                    name={benefit.eligible ? 'check_circle' : 'lock'}
                    filled={benefit.eligible}
                    size={22}
                    className={benefit.eligible ? 'mt-0.5 text-teal' : 'mt-0.5 text-outline-variant'}
                  />
                  <div>
                    <p
                      className={`body-lg ${
                        benefit.eligible
                          ? 'font-medium text-on-surface'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      {benefit.name}
                    </p>
                    <p className="body-sm text-on-surface-variant">{benefit.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function TrustScorePage() {
  return (
    <AppShell>
      <TrustScoreContent />
    </AppShell>
  );
}
