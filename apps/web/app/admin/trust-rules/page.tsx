'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminOnly } from '../../../components/admin-guard';
import { AppShell } from '../../../components/app-shell';
import { Card, Loading, PageHeader, Pill, SectionTitle } from '../../../components/layout';
import { Banner, Field, Icon, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi } from '../../../lib/api';
import { LEVEL_LABEL, TRUST_EVENT_LABEL } from '../../../lib/labels';

interface ScoreRule {
  id: string;
  eventName: string;
  description: string;
  points: number;
  conditions: Array<{ field: string; op: string; value: unknown }>;
  maxOccurrences: number | null;
  active: boolean;
}

interface LevelRule {
  id: string;
  level: string;
  minScore: number;
  maxScore: number;
  rank: number;
  active: boolean;
}

interface Benefit {
  id: string;
  name: string;
  description: string;
  eligibility: Array<{ field: string; op: string; value: unknown }>;
  active: boolean;
}

interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  badgeType: string;
  criteria: Array<{ field: string; op: string; value: unknown }>;
  active: boolean;
}

const OP_LABEL: Record<string, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  in: 'entre',
};

/** Condição JSON em linguagem legível: `score ≥ 25`. */
function describeConditions(conditions: Array<{ field: string; op: string; value: unknown }>): string {
  if (conditions.length === 0) {
    return 'Sempre aplica';
  }
  return conditions
    .map(
      (condition) =>
        `${condition.field} ${OP_LABEL[condition.op] ?? condition.op} ${
          Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value)
        }`,
    )
    .join(' e ');
}

function TrustRulesContent() {
  const [scoreRules, setScoreRules] = useState<ScoreRule[] | null>(null);
  const [levelRules, setLevelRules] = useState<LevelRule[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ScoreRule | null>(null);
  const [editingLevel, setEditingLevel] = useState<LevelRule | null>(null);

  const load = useCallback(async () => {
    const safe = async <T,>(path: string): Promise<T[]> => {
      try {
        return await authApi<T[]>(path);
      } catch {
        return [];
      }
    };
    const [rules, levels, benefitList, badgeList] = await Promise.all([
      safe<ScoreRule>('/admin/trust-score-rules'),
      safe<LevelRule>('/admin/trust-level-rules'),
      safe<Benefit>('/admin/trust-benefits'),
      safe<Badge>('/admin/trust-badges'),
    ]);
    setScoreRules(rules);
    setLevelRules(levels);
    setBenefits(benefitList);
    setBadges(badgeList);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRule = async () => {
    if (!editing) return;
    setBusy(true);
    setMessage(null);
    try {
      await authApi(`/admin/trust-score-rules/${editing.id}`, {
        method: 'PATCH',
        body: {
          description: editing.description,
          points: editing.points,
          maxOccurrences: editing.maxOccurrences,
          active: editing.active,
        },
      });
      setEditing(null);
      await load();
      setMessage({
        kind: 'success',
        text: 'Regra atualizada. Ela vale para os próximos eventos — o histórico já pontuado não muda.',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível salvar.',
      });
    } finally {
      setBusy(false);
    }
  };

  const saveLevel = async () => {
    if (!editingLevel) return;
    setBusy(true);
    setMessage(null);
    try {
      await authApi(`/admin/trust-level-rules/${editingLevel.id}`, {
        method: 'PATCH',
        body: {
          minScore: editingLevel.minScore,
          maxScore: editingLevel.maxScore,
          active: editingLevel.active,
        },
      });
      setEditingLevel(null);
      await load();
      setMessage({
        kind: 'success',
        text: 'Faixa atualizada. O nível de cada pessoa é recalculado no próximo evento de score.',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível salvar.',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!scoreRules) {
    return <Loading label="Carregando regras..." />;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Regras do Trust Score"
        subtitle="O motor é determinístico: estas regras são os dados que ele aplica. Mudanças valem daqui para frente."
        back={{ href: '/admin', label: 'Moderação' }}
      />

      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}

      <Banner kind="info" icon="info">
        Alterar uma regra <strong>não reescreve o passado</strong>: os pontos já registrados
        permanecem como estavam. Para reprocessar um histórico, use o rebuild do Trust Score.
      </Banner>

      {/* Pontuação por evento */}
      <Card padded={false}>
        <div className="border-b border-outline-variant p-6">
          <h2 className="headline-md text-lg text-on-surface">Pontuação por evento</h2>
          <p className="body-sm text-on-surface-variant">
            Quanto cada fato vale. A primeira regra que casa com o evento é a que pontua.
          </p>
        </div>
        <ul className="divide-y divide-outline-variant/50">
          {scoreRules.map((rule) => (
            <li key={rule.id} className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="body-lg font-medium text-on-surface">{rule.description}</p>
                  <p className="body-sm text-on-surface-variant">
                    {TRUST_EVENT_LABEL[rule.eventName] ?? rule.eventName} ·{' '}
                    {describeConditions(rule.conditions)}
                    {rule.maxOccurrences !== null
                      ? ` · máx. ${rule.maxOccurrences}x por pessoa`
                      : ' · sem limite'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`headline-md text-lg ${
                      rule.points >= 0 ? 'text-teal' : 'text-error'
                    }`}
                  >
                    {rule.points > 0 ? '+' : ''}
                    {rule.points}
                  </span>
                  {!rule.active ? <Pill>Inativa</Pill> : null}
                  <button
                    type="button"
                    onClick={() => setEditing({ ...rule })}
                    className="text-on-surface-variant transition-colors hover:text-primary"
                    aria-label="Editar regra"
                  >
                    <Icon name="edit" size={20} />
                  </button>
                </div>
              </div>

              {editing?.id === rule.id ? (
                <div className="flex flex-col gap-4 rounded-lg border border-outline-variant p-4">
                  <Field id={`desc-${rule.id}`} label="Descrição">
                    <input
                      id={`desc-${rule.id}`}
                      className="tds-input"
                      value={editing.description}
                      onChange={(event) =>
                        setEditing({ ...editing, description: event.target.value })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field id={`points-${rule.id}`} label="Pontos">
                      <input
                        id={`points-${rule.id}`}
                        type="number"
                        className="tds-input"
                        value={editing.points}
                        onChange={(event) =>
                          setEditing({ ...editing, points: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field id={`max-${rule.id}`} label="Máximo por pessoa (vazio = sem limite)">
                      <input
                        id={`max-${rule.id}`}
                        type="number"
                        min="1"
                        className="tds-input"
                        value={editing.maxOccurrences ?? ''}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            maxOccurrences: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editing.active}
                      onChange={(event) => setEditing({ ...editing, active: event.target.checked })}
                    />
                    <span className="body-sm text-on-surface">Regra ativa</span>
                  </label>
                  <div className="flex flex-col gap-3 md:w-64">
                    <PrimaryButton type="button" loading={busy} onClick={() => void saveRule()}>
                      Salvar
                    </PrimaryButton>
                    <SecondaryButton onClick={() => setEditing(null)}>Cancelar</SecondaryButton>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {/* Faixas de nível */}
      <Card padded={false}>
        <div className="border-b border-outline-variant p-6">
          <h2 className="headline-md text-lg text-on-surface">Faixas de nível</h2>
          <p className="body-sm text-on-surface-variant">
            Em que pontuação cada nível começa e termina, na escala de 0 a 1000.
          </p>
        </div>
        <ul className="divide-y divide-outline-variant/50">
          {levelRules.map((level) => (
            <li key={level.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="body-lg font-medium text-on-surface">
                  {LEVEL_LABEL[level.level] ?? level.level}
                </span>
                <div className="flex items-center gap-3">
                  <span className="body-sm text-on-surface-variant">
                    {level.minScore} – {level.maxScore}
                  </span>
                  {!level.active ? <Pill>Inativa</Pill> : null}
                  <button
                    type="button"
                    onClick={() => setEditingLevel({ ...level })}
                    className="text-on-surface-variant transition-colors hover:text-primary"
                    aria-label="Editar faixa"
                  >
                    <Icon name="edit" size={20} />
                  </button>
                </div>
              </div>

              {editingLevel?.id === level.id ? (
                <div className="flex flex-col gap-4 rounded-lg border border-outline-variant p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field id={`min-${level.id}`} label="Score mínimo">
                      <input
                        id={`min-${level.id}`}
                        type="number"
                        min="0"
                        max="1000"
                        className="tds-input"
                        value={editingLevel.minScore}
                        onChange={(event) =>
                          setEditingLevel({ ...editingLevel, minScore: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field id={`max-level-${level.id}`} label="Score máximo">
                      <input
                        id={`max-level-${level.id}`}
                        type="number"
                        min="0"
                        max="1000"
                        className="tds-input"
                        value={editingLevel.maxScore}
                        onChange={(event) =>
                          setEditingLevel({ ...editingLevel, maxScore: Number(event.target.value) })
                        }
                      />
                    </Field>
                  </div>
                  <div className="flex flex-col gap-3 md:w-64">
                    <PrimaryButton type="button" loading={busy} onClick={() => void saveLevel()}>
                      Salvar
                    </PrimaryButton>
                    <SecondaryButton onClick={() => setEditingLevel(null)}>Cancelar</SecondaryButton>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card>
          <SectionTitle
            icon="workspace_premium"
            title="Selos"
            hint="Concedidos automaticamente quando o critério passa a valer."
          />
          <ul className="flex flex-col gap-3">
            {badges.map((badge) => (
              <li key={badge.id} className="rounded-lg border border-outline-variant p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="body-lg font-medium text-on-surface">{badge.name}</span>
                  <Pill tone={badge.badgeType === 'PERMANENT' ? 'success' : 'info'}>
                    {badge.badgeType === 'PERMANENT' ? 'Permanente' : 'Dinâmico'}
                  </Pill>
                </div>
                <p className="body-sm text-on-surface-variant">{badge.description}</p>
                <p className="body-sm mt-1 font-mono text-outline">
                  {describeConditions(badge.criteria)}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle
            icon="card_giftcard"
            title="Benefícios"
            hint="Avaliados na hora da consulta — nada é concedido de forma permanente."
          />
          <ul className="flex flex-col gap-3">
            {benefits.map((benefit) => (
              <li key={benefit.id} className="rounded-lg border border-outline-variant p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="body-lg font-medium text-on-surface">{benefit.name}</span>
                  {!benefit.active ? <Pill>Inativo</Pill> : null}
                </div>
                <p className="body-sm text-on-surface-variant">{benefit.description}</p>
                <p className="body-sm mt-1 font-mono text-outline">
                  {describeConditions(benefit.eligibility)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default function TrustRulesPage() {
  return (
    <AppShell>
      <AdminOnly>
        <TrustRulesContent />
      </AdminOnly>
    </AppShell>
  );
}
