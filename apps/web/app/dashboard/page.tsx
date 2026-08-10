'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, useIdentity } from '../../components/app-shell';
import {
  Card,
  EmptyState,
  Loading,
  Pill,
  ScoreRing,
  SectionTitle,
  TrustLevelBadge,
} from '../../components/layout';
import { Icon } from '../../components/ui';
import { ApiError, authApi } from '../../lib/api';
import { LEVEL_LABEL, TRUST_EVENT_LABEL, formatRelative } from '../../lib/labels';
import type {
  TrustBadge,
  TrustEventEntry,
  TrustPassport,
  TrustScore,
  Verification,
} from '../../lib/types';

interface DashboardData {
  score: TrustScore | null;
  passport: TrustPassport | null;
  badges: TrustBadge[];
  verifications: Verification[];
  timeline: TrustEventEntry[];
}

/** Falhas isoladas não podem derrubar o painel inteiro. */
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

function DashboardContent() {
  const identity = useIdentity();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void (async () => {
      const [score, passport, badges, verifications, timeline] = await Promise.all([
        safe(authApi<TrustScore>('/trust-scores/me'), null),
        safe(authApi<TrustPassport>('/trust-passports/me'), null),
        safe(authApi<TrustBadge[]>('/trust-badges/me'), []),
        safe(authApi<Verification[]>('/verifications'), []),
        safe(authApi<TrustEventEntry[]>('/trust-scores/me/timeline'), []),
      ]);
      setData({ score, passport, badges, verifications, timeline });
    })();
  }, []);

  if (!data) {
    return <Loading label="Carregando seu painel..." />;
  }

  const firstName = identity?.fullName.split(/\s+/)[0] ?? '';
  const score = data.score?.score ?? 0;
  const level = data.score?.level ?? 'UNVERIFIED';
  const approved = data.verifications.filter((v) => v.status === 'APPROVED').length;
  const pending = data.verifications.filter((v) =>
    ['WAITING_FOR_EVIDENCE', 'PENDING_REVIEW', 'IN_REVIEW'].includes(v.status),
  ).length;
  const completion = data.passport?.profileCompletion ?? 0;

  const steps = [
    { label: 'Confirmar e-mail', done: identity?.status === 'ACTIVE', href: null },
    {
      label: 'Completar seu Trust Passport',
      done: Boolean(data.passport?.profile.phone && data.passport.profile.addressCity),
      href: '/trust-passport',
      description: 'Telefone e endereço deixam seu perfil pronto para verificação.',
    },
    {
      label: 'Verificar seu documento de identidade',
      done: data.passport?.documentVerified ?? false,
      href: '/verifications',
      description: 'A verificação que mais pesa no seu Trust Score (+150 pontos).',
    },
    {
      label: 'Publicar seu primeiro anúncio',
      done: false,
      href: '/marketplace/mine',
      description: 'Ofereça um serviço e comece a receber contatos.',
    },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h1 className="headline-lg text-on-surface">Olá, {firstName}</h1>
        <p className="body-lg mt-1 text-on-surface-variant">
          Acompanhe a evolução da sua confiança
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* Trust Score */}
        <Card className="relative flex flex-col items-center justify-center">
          <h3 className="label-bold absolute left-4 top-4 uppercase text-on-surface">Trust Score</h3>
          <Link href="/trust-score" className="mt-6 flex flex-col items-center gap-4">
            <ScoreRing score={score} level={level} />
            <TrustLevelBadge level={level} />
          </Link>
          <Link
            href="/trust-score"
            className="body-sm mt-4 flex items-center gap-1 text-primary hover:underline"
          >
            Ver como foi construído
            <Icon name="arrow_forward" size={16} />
          </Link>
        </Card>

        {/* Verificações */}
        <Card className="flex flex-col justify-between">
          <div>
            <SectionTitle icon="fact_check" title="Verificações" />
            <p className="headline-md mt-4 text-on-surface">
              {approved}{' '}
              <span className="text-lg font-normal text-on-surface-variant">
                {approved === 1 ? 'aprovada' : 'aprovadas'}
              </span>
            </p>
            {pending > 0 ? (
              <p className="body-sm mt-2 text-on-surface-variant">
                {pending} em andamento
              </p>
            ) : null}
          </div>
          <Link
            href="/verifications"
            className="btn-text mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container py-3 text-on-primary transition-colors hover:bg-primary"
          >
            <span>{approved > 0 ? 'Gerenciar verificações' : 'Iniciar verificação'}</span>
            <Icon name="arrow_forward" size={18} />
          </Link>
        </Card>

        {/* Passport */}
        <Card className="flex flex-col justify-between">
          <div>
            <SectionTitle icon="badge" title="Trust Passport" />
            <div className="mt-6">
              <div className="mb-2 flex justify-between">
                <span className="label-bold text-on-surface-variant">COMPLETUDE</span>
                <span className="label-bold text-primary">{completion}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-primary-container transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </div>
            {data.badges.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.badges.slice(0, 3).map((badge) => (
                  <Pill key={badge.code} tone="success" icon="workspace_premium">
                    {badge.name}
                  </Pill>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            href="/trust-passport"
            className="btn-text mt-6 w-full rounded-xl border border-outline-variant bg-transparent py-3 text-center text-on-background transition-colors hover:bg-surface-container-low"
          >
            Completar perfil
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Próximos passos */}
        <div className="lg:col-span-2">
          <Card padded={false} className="overflow-hidden">
            <div className="border-b border-outline-variant bg-surface-bright p-6">
              <h3 className="headline-md text-lg text-on-surface">Próximos passos</h3>
              <p className="body-sm text-on-surface-variant">
                Complete estas ações para aumentar seu Trust Score.
              </p>
            </div>
            <div>
              {steps.map((step, index) => {
                const content = (
                  <div
                    className={`flex items-start gap-4 p-4 ${
                      index < steps.length - 1 ? 'border-b border-outline-variant/50' : ''
                    } ${step.done ? 'bg-surface-container/30' : 'hover:bg-surface-container-low'}`}
                  >
                    <Icon
                      name={step.done ? 'check_circle' : 'radio_button_unchecked'}
                      filled={step.done}
                      className={step.done ? 'mt-0.5 text-teal' : 'mt-0.5 text-outline-variant'}
                      size={22}
                    />
                    <div className="flex-1">
                      <p
                        className={`body-lg text-on-surface ${
                          step.done ? 'line-through opacity-70' : 'font-semibold'
                        }`}
                      >
                        {step.label}
                      </p>
                      {step.description && !step.done ? (
                        <p className="body-sm mt-1 text-on-surface-variant">{step.description}</p>
                      ) : null}
                    </div>
                    {step.href && !step.done ? (
                      <Icon name="chevron_right" className="mt-1 text-outline" size={20} />
                    ) : null}
                  </div>
                );
                return step.href && !step.done ? (
                  <Link key={step.label} href={step.href} className="block">
                    {content}
                  </Link>
                ) : (
                  <div key={step.label}>{content}</div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Atividade recente — a timeline do Trust Score */}
        <div className="lg:col-span-1">
          <Card padded={false} className="flex h-full flex-col overflow-hidden">
            <div className="border-b border-outline-variant p-6">
              <h3 className="headline-md text-lg text-on-surface">Atividade recente</h3>
            </div>
            {data.timeline.length === 0 ? (
              <EmptyState
                icon="history"
                title="Nenhuma atividade ainda"
                description="Suas verificações e transações aparecerão aqui."
              />
            ) : (
              <ul className="divide-y divide-outline-variant/50">
                {data.timeline.slice(0, 6).map((event, index) => (
                  <li key={`${event.eventName}-${index}`} className="flex items-start gap-3 p-4">
                    <Icon
                      name={event.points >= 0 ? 'trending_up' : 'trending_down'}
                      size={20}
                      className={event.points >= 0 ? 'text-teal' : 'text-error'}
                    />
                    <div className="flex-1">
                      <p className="body-sm font-medium text-on-surface">
                        {TRUST_EVENT_LABEL[event.eventName] ?? event.eventName}
                      </p>
                      <p className="body-sm text-on-surface-variant">
                        {formatRelative(event.occurredAt)}
                      </p>
                    </div>
                    {event.points !== 0 ? (
                      <span
                        className={`label-bold ${event.points > 0 ? 'text-teal' : 'text-error'}`}
                      >
                        {event.points > 0 ? '+' : ''}
                        {event.points}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {level === 'UNVERIFIED' ? (
        <Card className="flex flex-col items-start gap-3 border-l-4 border-l-primary-container md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Icon name="lightbulb" className="mt-0.5 text-primary" size={22} />
            <div>
              <p className="body-lg font-semibold text-on-surface">
                Sua conta ainda não tem pontuação
              </p>
              <p className="body-sm text-on-surface-variant">
                Verifique seu documento para chegar ao nível {LEVEL_LABEL.SILVER} e publicar em
                categorias como Elétrica e Hidráulica.
              </p>
            </div>
          </div>
          <Link
            href="/verifications"
            className="btn-text whitespace-nowrap rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary"
          >
            Começar
          </Link>
        </Card>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
