'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, useIdentity } from '../../../components/app-shell';
import {
  Card,
  ErrorState,
  Loading,
  PageHeader,
  Pill,
  SectionTitle,
  StarRating,
  toneForStatus,
} from '../../../components/layout';
import { Banner, Field, Icon, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi } from '../../../lib/api';
import {
  DISPUTE_CATEGORY_LABEL,
  DISPUTE_STATUS_LABEL,
  DECISION_TYPE_LABEL,
  NEXT_ACTION_LABEL,
  ORDER_STATUS_LABEL,
  REVIEW_CRITERION_LABEL,
  TIMELINE_LABEL,
  formatCurrency,
  formatDateTime,
  formatDuration,
} from '../../../lib/labels';
import type { Dispute, OrderDetails, Review } from '../../../lib/types';

const CRITERIA = ['quality', 'communication', 'punctuality', 'costBenefit', 'organization'];
const REVIEWABLE = ['COMPLETED', 'CLOSED', 'DISPUTE_RESOLVED'];

/** Início padrão do agendamento: amanhã às 9h. */
function defaultStart(): string {
  const date = new Date(Date.now() + 86400000);
  date.setHours(9, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

type Panel = 'schedule' | 'cancel' | 'review' | 'dispute' | null;

function OrderContent() {
  const params = useParams<{ orderId: string }>();
  const identity = useIdentity();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const [start, setStart] = useState(defaultStart());
  const [duration, setDuration] = useState('120');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [overallScore, setOverallScore] = useState(5);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [recommended, setRecommended] = useState(true);
  const [disputeCategory, setDisputeCategory] = useState('SERVICE_NOT_COMPLETED');

  const load = useCallback(async () => {
    try {
      const [details, reviewList, disputeList] = await Promise.all([
        authApi<OrderDetails>(`/marketplace/orders/${params.orderId}`),
        authApi<Review[]>(`/marketplace/orders/${params.orderId}/reviews`).catch(() => [] as Review[]),
        authApi<Dispute[]>(`/marketplace/orders/${params.orderId}/disputes`).catch(
          () => [] as Dispute[],
        ),
      ]);
      setOrder(details);
      setReviews(reviewList);
      setDisputes(disputeList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o pedido.');
    }
  }, [params.orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (path: string, body?: unknown, successText?: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await authApi(`/marketplace/orders/${params.orderId}/${path}`, {
        method: 'POST',
        body: body ?? {},
      });
      setPanel(null);
      await load();
      if (successText) {
        setFeedback({ kind: 'success', text: successText });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Operação não permitida agora.',
      });
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await authApi(`/marketplace/orders/${params.orderId}/reviews`, {
        method: 'POST',
        body: {
          overallScore,
          recommended,
          comment: notes.trim() || undefined,
          scores: Object.keys(scores).length > 0 ? scores : undefined,
        },
      });
      setPanel(null);
      setNotes('');
      await load();
      setFeedback({
        kind: 'success',
        text: 'Avaliação registrada. Ela já entrou no Trust Score da outra parte.',
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível avaliar.',
      });
    } finally {
      setBusy(false);
    }
  };

  const openDispute = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await authApi(`/marketplace/orders/${params.orderId}/disputes`, {
        method: 'POST',
        body: { category: disputeCategory, description: reason },
      });
      setPanel(null);
      setReason('');
      await load();
      setFeedback({ kind: 'success', text: 'Disputa aberta. Nossa equipe vai analisar o caso.' });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível abrir a disputa.',
      });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!order) {
    return <Loading label="Carregando pedido..." />;
  }

  const me = identity?.identityId;
  const isSeller = me === order.sellerId;
  const myReview = reviews.find((review) => review.reviewerId === me);
  const canReview = REVIEWABLE.includes(order.status) && !myReview;
  const canDispute = ['IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION', 'CUSTOMER_CONFIRMED', 'COMPLETED'].includes(
    order.status,
  );
  const canCancel = ['CREATED', 'AWAITING_SCHEDULING', 'SCHEDULED', 'AWAITING_EXECUTION'].includes(
    order.status,
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={order.listingTitle ?? 'Pedido'}
        subtitle={isSeller ? 'Você é o prestador' : 'Você é o cliente'}
        back={{ href: '/orders', label: 'Todos os pedidos' }}
        action={
          <Pill tone={toneForStatus(order.status)}>
            {ORDER_STATUS_LABEL[order.status] ?? order.status}
          </Pill>
        }
      />

      {feedback ? (
        <Banner kind={feedback.kind === 'success' ? 'success' : 'error'}>{feedback.text}</Banner>
      ) : null}

      <Banner kind="info" icon="flag">
        <strong>Próximo passo:</strong> {NEXT_ACTION_LABEL[order.nextAction] ?? order.nextAction}
      </Banner>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Linha do tempo */}
          <Card padded={false}>
            <div className="border-b border-outline-variant p-6">
              <h2 className="headline-md text-lg text-on-surface">Linha do tempo</h2>
            </div>
            <ol className="flex flex-col p-6">
              {order.timeline.map((entry, index) => (
                <li key={`${entry.type}-${index}`} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-container text-teal">
                      <Icon name="check" size={16} />
                    </div>
                    {index < order.timeline.length - 1 ? (
                      <div className="h-full min-h-8 w-px bg-outline-variant" />
                    ) : null}
                  </div>
                  <div className="pb-6">
                    <p className="body-lg font-medium text-on-surface">
                      {TIMELINE_LABEL[entry.type] ?? entry.type}
                    </p>
                    <p className="body-sm text-on-surface-variant">
                      {formatDateTime(entry.occurredAt)}
                    </p>
                    {entry.detail ? (
                      <p className="body-sm mt-1 text-on-surface-variant">{entry.detail}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {/* Avaliações */}
          {reviews.length > 0 ? (
            <Card>
              <SectionTitle icon="reviews" title="Avaliações" />
              <ul className="flex flex-col gap-4">
                {reviews.map((review) => (
                  <li key={review.reviewId} className="rounded-lg border border-outline-variant p-4">
                    <div className="flex items-center justify-between">
                      <span className="body-sm font-medium text-on-surface">
                        {review.reviewerId === me ? 'Sua avaliação' : 'Avaliação recebida'}
                      </span>
                      <StarRating value={review.overallScore} size={18} />
                    </div>
                    {review.comment ? (
                      <p className="body-sm mt-2 text-on-surface">{review.comment}</p>
                    ) : null}
                    {Object.keys(review.scores).length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(review.scores).map(([criterion, value]) => (
                          <Pill key={criterion}>
                            {REVIEW_CRITERION_LABEL[criterion] ?? criterion}: {value}
                          </Pill>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Disputas */}
          {disputes.length > 0 ? (
            <Card>
              <SectionTitle icon="gavel" title="Disputas" />
              <ul className="flex flex-col gap-4">
                {disputes.map((dispute) => (
                  <li key={dispute.disputeId} className="rounded-lg border border-outline-variant p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="body-lg font-medium text-on-surface">
                        {DISPUTE_CATEGORY_LABEL[dispute.category] ?? dispute.category}
                      </span>
                      <Pill tone={toneForStatus(dispute.status)}>
                        {DISPUTE_STATUS_LABEL[dispute.status] ?? dispute.status}
                      </Pill>
                    </div>
                    <p className="body-sm mt-2 text-on-surface">{dispute.description}</p>
                    {dispute.decision ? (
                      <div className="mt-3 rounded-lg bg-surface-container-low p-3">
                        <p className="body-sm font-semibold text-on-surface">
                          Decisão: {DECISION_TYPE_LABEL[dispute.decision.decisionType]}
                        </p>
                        <p className="body-sm mt-1 text-on-surface-variant">
                          {dispute.decision.justification}
                        </p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {/* Ações e resumo */}
        <div className="flex flex-col gap-6">
          <Card>
            <SectionTitle icon="receipt" title="Resumo" />
            <dl className="flex flex-col gap-3">
              <div className="flex justify-between">
                <dt className="body-sm text-on-surface-variant">Valor</dt>
                <dd className="body-lg font-semibold text-on-surface">
                  {formatCurrency(order.amount, order.currency)}
                </dd>
              </div>
              {order.scheduling ? (
                <div className="flex justify-between gap-3">
                  <dt className="body-sm text-on-surface-variant">Agendado</dt>
                  <dd className="body-sm text-right text-on-surface">
                    {formatDateTime(order.scheduling.scheduledStart)}
                    <br />
                    <span className="text-on-surface-variant">
                      {formatDuration(order.scheduling.estimatedDuration)} previstos
                    </span>
                  </dd>
                </div>
              ) : null}
              {order.actualDuration !== null ? (
                <div className="flex justify-between">
                  <dt className="body-sm text-on-surface-variant">Duração real</dt>
                  <dd className="body-sm text-on-surface">{formatDuration(order.actualDuration)}</dd>
                </div>
              ) : null}
              {order.cancellationReason ? (
                <div>
                  <dt className="body-sm text-on-surface-variant">Motivo do cancelamento</dt>
                  <dd className="body-sm text-on-surface">{order.cancellationReason}</dd>
                </div>
              ) : null}
            </dl>
            <Link
              href={`/conversations/${order.conversationId}`}
              className="body-sm mt-4 flex items-center gap-1 text-primary hover:underline"
            >
              Abrir a conversa
              <Icon name="arrow_forward" size={16} />
            </Link>
          </Card>

          <Card>
            <SectionTitle icon="bolt" title="Ações" />
            <div className="flex flex-col gap-3">
              {order.status === 'CREATED' || order.status === 'AWAITING_SCHEDULING' ? (
                <PrimaryButton type="button" onClick={() => setPanel('schedule')}>
                  Agendar serviço
                </PrimaryButton>
              ) : null}

              {isSeller && ['SCHEDULED', 'AWAITING_EXECUTION'].includes(order.status) ? (
                <PrimaryButton
                  type="button"
                  loading={busy}
                  onClick={() => void act('start', { notes: 'Cheguei ao local.' }, 'Serviço iniciado.')}
                >
                  Iniciar serviço (check-in)
                </PrimaryButton>
              ) : null}

              {isSeller && order.status === 'IN_PROGRESS' ? (
                <PrimaryButton
                  type="button"
                  loading={busy}
                  onClick={() => void act('complete', {}, 'Serviço concluído. O cliente vai confirmar.')}
                >
                  Concluir serviço (check-out)
                </PrimaryButton>
              ) : null}

              {!isSeller && order.status === 'AWAITING_CUSTOMER_CONFIRMATION' ? (
                <PrimaryButton
                  type="button"
                  loading={busy}
                  onClick={() =>
                    void act('confirm-completion', {}, 'Conclusão confirmada. Obrigado!')
                  }
                >
                  Confirmar conclusão
                </PrimaryButton>
              ) : null}

              {canReview ? (
                <PrimaryButton type="button" onClick={() => setPanel('review')}>
                  Avaliar a transação
                </PrimaryButton>
              ) : null}

              {canDispute && disputes.every((dispute) => dispute.status === 'RESOLVED') ? (
                <SecondaryButton onClick={() => setPanel('dispute')}>Abrir disputa</SecondaryButton>
              ) : null}

              {canCancel ? (
                <SecondaryButton onClick={() => setPanel('cancel')}>Cancelar pedido</SecondaryButton>
              ) : null}

              {panel === null &&
              !canReview &&
              !canCancel &&
              order.status !== 'IN_PROGRESS' &&
              order.nextAction === 'NONE' ? (
                <p className="body-sm text-on-surface-variant">Nada pendente neste pedido.</p>
              ) : null}
            </div>
          </Card>

          {/* Painéis contextuais */}
          {panel === 'schedule' ? (
            <Card>
              <SectionTitle icon="event" title="Agendar" />
              <div className="flex flex-col gap-4">
                <Field id="start" label="Data e hora">
                  <input
                    id="start"
                    type="datetime-local"
                    className="tds-input"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </Field>
                <Field id="duration" label="Duração prevista (minutos)">
                  <input
                    id="duration"
                    type="number"
                    min="15"
                    max="1440"
                    className="tds-input"
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                  />
                </Field>
                <PrimaryButton
                  type="button"
                  loading={busy}
                  onClick={() =>
                    void act(
                      'schedule',
                      {
                        scheduledStart: new Date(start).toISOString(),
                        estimatedDuration: Number(duration),
                      },
                      'Serviço agendado.',
                    )
                  }
                >
                  Confirmar agendamento
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>Cancelar</SecondaryButton>
              </div>
            </Card>
          ) : null}

          {panel === 'cancel' ? (
            <Card>
              <SectionTitle icon="cancel" title="Cancelar pedido" />
              <div className="flex flex-col gap-4">
                <Banner kind="warning">
                  O cancelamento é registrado e afeta a reputação de quem cancela.
                </Banner>
                <Field id="reason" label="Motivo (obrigatório)">
                  <textarea
                    id="reason"
                    className="tds-input min-h-20 resize-y"
                    value={reason}
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
                <PrimaryButton
                  type="button"
                  loading={busy}
                  disabled={reason.trim().length < 3}
                  onClick={() => void act('cancel', { reason: reason.trim() }, 'Pedido cancelado.')}
                >
                  Confirmar cancelamento
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>Voltar</SecondaryButton>
              </div>
            </Card>
          ) : null}

          {panel === 'review' ? (
            <Card>
              <SectionTitle icon="star" title="Avaliar" />
              <div className="flex flex-col gap-4">
                <div>
                  <p className="label-bold mb-2 text-on-surface">Nota geral</p>
                  <StarRating value={overallScore} onChange={setOverallScore} />
                </div>
                {CRITERIA.map((criterion) => (
                  <div key={criterion}>
                    <p className="body-sm mb-1 text-on-surface-variant">
                      {REVIEW_CRITERION_LABEL[criterion]}
                    </p>
                    <StarRating
                      value={scores[criterion] ?? 0}
                      size={18}
                      onChange={(value) => setScores({ ...scores, [criterion]: value })}
                    />
                  </div>
                ))}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={recommended}
                    onChange={(event) => setRecommended(event.target.checked)}
                  />
                  <span className="body-sm text-on-surface">Eu recomendaria</span>
                </label>
                <Field id="comment" label="Comentário">
                  <textarea
                    id="comment"
                    className="tds-input min-h-20 resize-y"
                    value={notes}
                    maxLength={2000}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
                <PrimaryButton type="button" loading={busy} onClick={() => void submitReview()}>
                  Enviar avaliação
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>Cancelar</SecondaryButton>
              </div>
            </Card>
          ) : null}

          {panel === 'dispute' ? (
            <Card>
              <SectionTitle icon="gavel" title="Abrir disputa" />
              <div className="flex flex-col gap-4">
                <Field id="category" label="O que aconteceu?">
                  <select
                    id="category"
                    className="tds-input"
                    value={disputeCategory}
                    onChange={(event) => setDisputeCategory(event.target.value)}
                  >
                    {Object.entries(DISPUTE_CATEGORY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="description" label="Descreva o problema (mínimo 20 caracteres)">
                  <textarea
                    id="description"
                    className="tds-input min-h-28 resize-y"
                    value={reason}
                    maxLength={5000}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
                <PrimaryButton
                  type="button"
                  loading={busy}
                  disabled={reason.trim().length < 20}
                  onClick={() => void openDispute()}
                >
                  Abrir disputa
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>Cancelar</SecondaryButton>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <AppShell>
      <OrderContent />
    </AppShell>
  );
}
