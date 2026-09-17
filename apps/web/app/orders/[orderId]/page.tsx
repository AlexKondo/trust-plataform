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
import { useLocale } from '../../../lib/i18n/LocaleProvider';
import {
  CHANGE_ORDER_STATUS_LABEL,
  CHANGE_ORDER_TYPE_LABEL,
  DISPUTE_CATEGORY_LABEL,
  DISPUTE_STATUS_LABEL,
  DECISION_TYPE_LABEL,
  EXECUTION_EVIDENCE_TYPE_LABEL,
  NEXT_ACTION_LABEL,
  ORDER_STATUS_LABEL,
  REVIEW_CRITERION_LABEL,
  TIMELINE_LABEL,
  TRAVEL_STATUS_LABEL,
  formatCurrency,
  formatDateTime,
  formatDuration,
} from '../../../lib/labels';
import type {
  ChangeOrder,
  CreateChangeOrderRequest,
  Dispute,
  ExecutionEvidence,
  OrderDetails,
  PaymentDetails,
  Review,
  ServiceNote,
  ServiceSummary,
  TravelStatus,
} from '../../../lib/types';

const CRITERIA = ['quality', 'communication', 'punctuality', 'costBenefit', 'organization'];
const REVIEWABLE = ['COMPLETED', 'CLOSED', 'DISPUTE_RESOLVED'];
const PAUSE_REASONS = ['PERSONAL_BREAK', 'PERSONAL_CALL', 'MEAL', 'OTHER_NON_BILLABLE'] as const;
const EXECUTION_EVIDENCE_TYPES = ['BEFORE', 'AFTER', 'OTHER'] as const;
const CHANGE_ORDER_TYPES = ['ADDITIONAL_TIME', 'SCOPE_CHANGE', 'MATERIAL', 'MIXED'] as const;

/** Início padrão do agendamento: amanhã às 9h. */
function defaultStart(): string {
  const date = new Date(Date.now() + 86400000);
  date.setHours(9, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

type Panel =
  | 'schedule'
  | 'cancel'
  | 'review'
  | 'dispute'
  | 'travel'
  | 'pause'
  | 'evidence'
  | 'note'
  | 'changeOrder'
  | null;

function OrderContent() {
  const params = useParams<{ orderId: string }>();
  const identity = useIdentity();
  const { t } = useLocale();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [travelStatus, setTravelStatus] = useState<TravelStatus | null>(null);
  const [evidences, setEvidences] = useState<ExecutionEvidence[]>([]);
  const [serviceNotes, setServiceNotes] = useState<ServiceNote[]>([]);
  const [serviceSummary, setServiceSummary] = useState<ServiceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changeOrderBusyId, setChangeOrderBusyId] = useState<string | null>(null);
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

  // IP-017 — Trust Partner Experience: estado dos formulários novos do prestador.
  const [etaMinutes, setEtaMinutes] = useState('30');
  const [pauseReason, setPauseReason] = useState<(typeof PAUSE_REASONS)[number]>('PERSONAL_BREAK');
  const [pauseNote, setPauseNote] = useState('');
  const [evidenceType, setEvidenceType] = useState<(typeof EXECUTION_EVIDENCE_TYPES)[number]>('BEFORE');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [changeOrderType, setChangeOrderType] =
    useState<(typeof CHANGE_ORDER_TYPES)[number]>('ADDITIONAL_TIME');
  const [changeOrderMinutes, setChangeOrderMinutes] = useState('30');
  const [changeOrderServiceDelta, setChangeOrderServiceDelta] = useState('0');
  const [changeOrderMaterialCost, setChangeOrderMaterialCost] = useState('0');
  const [changeOrderMaterialMarkup, setChangeOrderMaterialMarkup] = useState('0');
  const [changeOrderReason, setChangeOrderReason] = useState('');
  const [changeOrderDescription, setChangeOrderDescription] = useState('');

  const load = useCallback(async () => {
    try {
      const [
        details,
        reviewList,
        disputeList,
        changeOrderList,
        paymentDetails,
        travel,
        evidenceList,
        noteList,
        summary,
      ] = await Promise.all([
        authApi<OrderDetails>(`/marketplace/orders/${params.orderId}`),
        authApi<Review[]>(`/marketplace/orders/${params.orderId}/reviews`).catch(() => [] as Review[]),
        authApi<Dispute[]>(`/marketplace/orders/${params.orderId}/disputes`).catch(
          () => [] as Dispute[],
        ),
        // PACK-03 — Trust Change Order: rascunhos, pendentes de aprovação e decididos.
        authApi<ChangeOrder[]>(`/marketplace/orders/${params.orderId}/change-orders`).catch(
          () => [] as ChangeOrder[],
        ),
        // IP-007 — autorizações incrementais + custódia (breakdown original + mudanças aprovadas).
        authApi<PaymentDetails>(`/payments/by-order/${params.orderId}`).catch(() => null),
        // IP-005 — status de deslocamento / ETA do Partner.
        authApi<TravelStatus>(`/marketplace/orders/${params.orderId}/travel-status`).catch(() => null),
        // IP-006 — evidência de execução e notas de serviço (Trust Evidence).
        authApi<ExecutionEvidence[]>(`/marketplace/orders/${params.orderId}/execution-evidences`).catch(
          () => [] as ExecutionEvidence[],
        ),
        authApi<ServiceNote[]>(`/marketplace/orders/${params.orderId}/service-notes`).catch(
          () => [] as ServiceNote[],
        ),
        // IP-017 — Service Summary: execução (status de pausa) + economia do Partner
        // (`currentTrustFeeAmount`/`currentProviderNetBeforePspFees`, só preenchidos
        // pela API quando quem chama é o prestador — PACK-03 §15).
        authApi<ServiceSummary>(`/marketplace/orders/${params.orderId}/service-summary`).catch(
          () => null,
        ),
      ]);
      setOrder(details);
      setReviews(reviewList);
      setDisputes(disputeList);
      setChangeOrders(changeOrderList);
      setPayment(paymentDetails);
      setTravelStatus(travel);
      setEvidences(evidenceList);
      setServiceNotes(noteList);
      setServiceSummary(summary);
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

  /**
   * PACK-03 §6.1/§12 — só o Trust Member decide um Change Order PENDING_APPROVAL.
   * Nenhuma regra de elegibilidade/valor é calculada aqui: a API é a única
   * fonte de verdade, este botão só chama `approve`/`reject`.
   */
  const decideChangeOrder = async (changeOrderId: string, decision: 'approve' | 'reject') => {
    setChangeOrderBusyId(changeOrderId);
    setFeedback(null);
    try {
      await authApi(`/marketplace/change-orders/${changeOrderId}/${decision}`, {
        method: 'POST',
        body: decision === 'reject' ? {} : undefined,
      });
      await load();
      setFeedback({
        kind: 'success',
        text: decision === 'approve' ? 'Alteração aprovada e autorizada.' : 'Alteração recusada.',
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível decidir essa alteração agora.',
      });
    } finally {
      setChangeOrderBusyId(null);
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

  // IP-017 — declara "a caminho" com ETA (minutos), sem geolocalização (IP-005 §fonte-de-verdade).
  const declareEnRoute = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await authApi(`/marketplace/orders/${params.orderId}/travel-status/en-route`, {
        method: 'POST',
        body: { declaredEtaMinutes: Number(etaMinutes) },
      });
      setPanel(null);
      await load();
      setFeedback({ kind: 'success', text: t('partner.travelEnRouteSuccess') });
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message : t('common.genericError') });
    } finally {
      setBusy(false);
    }
  };

  const declareArrived = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await authApi(`/marketplace/orders/${params.orderId}/travel-status/arrived`, { method: 'POST' });
      await load();
      setFeedback({ kind: 'success', text: t('partner.travelArrivedSuccess') });
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message : t('common.genericError') });
    } finally {
      setBusy(false);
    }
  };

  /** §10.2 — Trust Pause: o relógio faturável para até o Partner retomar. */
  const pauseExecution = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await authApi(`/marketplace/orders/${params.orderId}/pause`, {
        method: 'POST',
        body: { reasonCode: pauseReason, note: pauseNote.trim() || undefined },
      });
      setPanel(null);
      setPauseNote('');
      await load();
      setFeedback({ kind: 'success', text: t('partner.pauseSuccess') });
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message : t('common.genericError') });
    } finally {
      setBusy(false);
    }
  };

  const resumeExecution = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await authApi(`/marketplace/orders/${params.orderId}/resume`, { method: 'POST' });
      await load();
      setFeedback({ kind: 'success', text: t('partner.resumeSuccess') });
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message : t('common.genericError') });
    } finally {
      setBusy(false);
    }
  };

  /** IP-006 — evidência opcional (multipart: campo `type` + arquivo `file`). */
  const uploadEvidence = async () => {
    if (!evidenceFile) return;
    setBusy(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append('type', evidenceType);
      form.append('file', evidenceFile);
      await authApi(`/marketplace/orders/${params.orderId}/execution-evidences`, {
        method: 'POST',
        form,
      });
      setPanel(null);
      setEvidenceFile(null);
      await load();
      setFeedback({ kind: 'success', text: t('partner.evidenceUploadSuccess') });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : t('partner.evidenceUploadError'),
      });
    } finally {
      setBusy(false);
    }
  };

  const addServiceNote = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await authApi(`/marketplace/orders/${params.orderId}/service-notes`, {
        method: 'POST',
        body: { body: noteBody.trim() },
      });
      setPanel(null);
      setNoteBody('');
      await load();
      setFeedback({ kind: 'success', text: t('partner.noteAddSuccess') });
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message : t('common.genericError') });
    } finally {
      setBusy(false);
    }
  };

  /**
   * PACK-03 §7/§6.1 — o Trust Partner só RASCUNHA e ENVIA a mudança; o valor
   * autorizado só sobe quando o Trust Member aprova (`decideChangeOrder`,
   * exclusivo do Member, ver acima). Não existe nem pode existir um caminho
   * aqui que aprove a própria proposta.
   */
  const createChangeOrder = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const body: CreateChangeOrderRequest = {
        type: changeOrderType,
        reason: changeOrderReason.trim(),
        description: changeOrderDescription.trim() || undefined,
      };
      if (changeOrderType === 'ADDITIONAL_TIME') {
        body.additionalMinutes = Number(changeOrderMinutes);
      } else {
        if (Number(changeOrderServiceDelta) > 0) body.serviceDeltaAmount = Number(changeOrderServiceDelta);
        if (Number(changeOrderMaterialCost) > 0) body.materialCostDeltaAmount = Number(changeOrderMaterialCost);
        if (Number(changeOrderMaterialMarkup) > 0)
          body.materialMarkupDeltaAmount = Number(changeOrderMaterialMarkup);
      }
      const created = await authApi<ChangeOrder>(`/marketplace/orders/${params.orderId}/change-orders`, {
        method: 'POST',
        body,
      });
      // §6.1 — vai direto para a mesa do Member; sem isso ficaria em DRAFT, invisível para ele.
      await authApi(`/marketplace/change-orders/${created.changeOrderId}/submit`, { method: 'POST' });
      setPanel(null);
      setChangeOrderReason('');
      setChangeOrderDescription('');
      await load();
      setFeedback({ kind: 'success', text: t('partner.changeOrderSubmitSuccess') });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : t('partner.changeOrderSubmitError'),
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

  // IP-017 — condições das novas ações do Trust Partner (leitura, não regra de negócio:
  // a API é quem decide de verdade e devolve 4xx se o estado não permitir).
  const canDeclareTravel =
    isSeller && ['SCHEDULED', 'AWAITING_EXECUTION'].includes(order.status) && travelStatus?.status !== 'ARRIVED';
  const isExecutionPaused = serviceSummary?.execution?.status === 'PAUSED';
  const canPauseOrResume = isSeller && order.status === 'IN_PROGRESS';
  const canProposeChangeOrder = isSeller && ['IN_PROGRESS', 'AWAITING_EXECUTION', 'SCHEDULED'].includes(order.status);
  const canAddEvidenceOrNote = isSeller && ['IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION'].includes(order.status);

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

          {/* IP-005 — status de deslocamento / ETA do Partner (+ ações do prestador, IP-017) */}
          {(travelStatus && travelStatus.status !== 'NOT_STARTED') || canDeclareTravel ? (
            <Card>
              <SectionTitle icon="local_shipping" title="Chegada do prestador" />
              {travelStatus && travelStatus.status !== 'NOT_STARTED' ? (
                <>
                  <div className="flex items-center justify-between">
                    <Pill tone={toneForStatus(travelStatus.status)}>
                      {TRAVEL_STATUS_LABEL[travelStatus.status] ?? travelStatus.status}
                    </Pill>
                    {travelStatus.estimatedArrivalAt ? (
                      <p className="body-sm text-on-surface-variant">
                        Previsão de chegada: {formatDateTime(travelStatus.estimatedArrivalAt)}
                      </p>
                    ) : null}
                  </div>
                  {travelStatus.declaredEtaMinutes !== null && travelStatus.status === 'EN_ROUTE' ? (
                    <p className="body-sm mt-2 text-on-surface-variant">
                      ETA declarado pelo prestador: {travelStatus.declaredEtaMinutes} min
                    </p>
                  ) : null}
                </>
              ) : null}
              {canDeclareTravel ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {travelStatus?.status !== 'EN_ROUTE' ? (
                    <SecondaryButton onClick={() => setPanel('travel')}>
                      {t('partner.travelDeclareEnRoute')}
                    </SecondaryButton>
                  ) : (
                    <PrimaryButton type="button" loading={busy} onClick={() => void declareArrived()}>
                      {t('partner.travelDeclareArrived')}
                    </PrimaryButton>
                  )}
                </div>
              ) : null}
            </Card>
          ) : null}

          {/* PACK-03 §6.1/§12 — Change Orders pendentes de aprovação do Trust Member */}
          {changeOrders.filter((changeOrder) => changeOrder.status === 'PENDING_APPROVAL').length > 0 ? (
            <Card>
              <SectionTitle
                icon="fact_check"
                title="Alterações aguardando sua aprovação"
                hint="Confira o valor original do pedido e o quanto esta alteração adiciona antes de decidir."
              />
              <ul className="flex flex-col gap-4">
                {changeOrders
                  .filter((changeOrder) => changeOrder.status === 'PENDING_APPROVAL')
                  .map((changeOrder) => (
                    <li key={changeOrder.changeOrderId} className="rounded-lg border border-outline-variant p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="body-lg font-medium text-on-surface">
                          {CHANGE_ORDER_TYPE_LABEL[changeOrder.type] ?? changeOrder.type}
                        </span>
                        <Pill tone={toneForStatus(changeOrder.status)}>
                          {CHANGE_ORDER_STATUS_LABEL[changeOrder.status] ?? changeOrder.status}
                        </Pill>
                      </div>
                      <p className="body-sm mt-2 text-on-surface">{changeOrder.reason}</p>
                      {changeOrder.description ? (
                        <p className="body-sm mt-1 text-on-surface-variant">{changeOrder.description}</p>
                      ) : null}

                      {/* Financeiro explícito: valor original + mudança aprovada + total final (§9 Shared Standards) */}
                      <dl className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-surface-container-low p-3 sm:grid-cols-3">
                        <div>
                          <dt className="body-sm text-on-surface-variant">Valor original do pedido</dt>
                          <dd className="body-md font-medium text-on-surface">
                            {formatCurrency(order.amount, order.currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="body-sm text-on-surface-variant">Esta alteração adiciona</dt>
                          <dd className="body-md font-medium text-on-surface">
                            + {formatCurrency(changeOrder.changeGrossAmount, changeOrder.currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="body-sm text-on-surface-variant">Total autorizado se aprovar</dt>
                          <dd className="body-lg font-semibold text-on-surface">
                            {formatCurrency(order.amount + changeOrder.changeGrossAmount, changeOrder.currency)}
                          </dd>
                        </div>
                      </dl>
                      {changeOrder.additionalMinutes !== null ? (
                        <p className="body-sm mt-2 text-on-surface-variant">
                          Tempo adicional: {formatDuration(changeOrder.additionalMinutes)}
                        </p>
                      ) : null}

                      {/*
                        Out-of-scope §"no self-approve": quem propôs a mudança (o Partner) NUNCA
                        vê botão de decisão na própria proposta — só o Trust Member decide
                        (`decideChangeOrder`/PACK-03 §6.1/§12). O estruturalmente correto é não
                        renderizar o caminho, não apenas escondê-lo por convenção de UI.
                      */}
                      {changeOrder.proposedBy !== me ? (
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <PrimaryButton
                            type="button"
                            loading={changeOrderBusyId === changeOrder.changeOrderId}
                            onClick={() => void decideChangeOrder(changeOrder.changeOrderId, 'approve')}
                          >
                            Aprovar alteração
                          </PrimaryButton>
                          <SecondaryButton
                            disabled={changeOrderBusyId === changeOrder.changeOrderId}
                            onClick={() => void decideChangeOrder(changeOrder.changeOrderId, 'reject')}
                          >
                            Recusar
                          </SecondaryButton>
                        </div>
                      ) : (
                        <p className="body-sm mt-4 text-on-surface-variant">
                          {t('partner.changeOrderNoSelfApprove')}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          ) : null}

          {/* Histórico de Change Orders já decididos */}
          {changeOrders.filter((changeOrder) => changeOrder.status !== 'PENDING_APPROVAL' && changeOrder.status !== 'DRAFT')
            .length > 0 ? (
            <Card>
              <SectionTitle icon="history" title="Alterações do pedido" />
              <ul className="flex flex-col gap-3">
                {changeOrders
                  .filter((changeOrder) => changeOrder.status !== 'PENDING_APPROVAL' && changeOrder.status !== 'DRAFT')
                  .map((changeOrder) => (
                    <li
                      key={changeOrder.changeOrderId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant p-3"
                    >
                      <div>
                        <p className="body-sm font-medium text-on-surface">
                          {CHANGE_ORDER_TYPE_LABEL[changeOrder.type] ?? changeOrder.type}
                        </p>
                        <p className="body-sm text-on-surface-variant">
                          {formatCurrency(changeOrder.changeGrossAmount, changeOrder.currency)}
                        </p>
                      </div>
                      <Pill tone={toneForStatus(changeOrder.status)}>
                        {CHANGE_ORDER_STATUS_LABEL[changeOrder.status] ?? changeOrder.status}
                      </Pill>
                    </li>
                  ))}
              </ul>
            </Card>
          ) : null}

          {/* IP-006 — evidências de execução e notas de serviço (Trust Evidence) */}
          {evidences.length > 0 || serviceNotes.length > 0 ? (
            <Card>
              <SectionTitle icon="photo_library" title="Evidências e notas do serviço" />
              {evidences.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {evidences.map((evidence) => (
                    <li key={evidence.evidenceId}>
                      <Pill icon="attach_file">
                        {EXECUTION_EVIDENCE_TYPE_LABEL[evidence.type] ?? evidence.type} · {evidence.fileName}
                      </Pill>
                    </li>
                  ))}
                </ul>
              ) : null}
              {serviceNotes.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-3">
                  {serviceNotes.map((note) => (
                    <li key={note.noteId} className="rounded-lg bg-surface-container-low p-3">
                      <p className="body-sm text-on-surface">{note.body}</p>
                      <p className="body-sm mt-1 text-on-surface-variant">{formatDateTime(note.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

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

          {/* IP-007 — autorizações incrementais: nunca mostra só o total original quando há Change Order aprovado */}
          {payment?.custodySummary ? (
            <Card>
              <SectionTitle
                icon="account_balance_wallet"
                title="Pagamento autorizado"
                hint="Original + alterações aprovadas = total autorizado."
              />
              <dl className="flex flex-col gap-3">
                <div className="flex justify-between">
                  <dt className="body-sm text-on-surface-variant">Valor original</dt>
                  <dd className="body-sm text-on-surface">
                    {formatCurrency(payment.custodySummary.originalAmount, payment.custodySummary.currency)}
                  </dd>
                </div>
                {payment.custodySummary.incrementalTranches.map((tranche) => (
                  <div key={tranche.incrementalAuthorizationId} className="flex justify-between">
                    <dt className="body-sm text-on-surface-variant">
                      Alteração aprovada ({tranche.authorizationStatus === 'AUTHORIZED' ? 'autorizada' : tranche.authorizationStatus.toLowerCase()})
                    </dt>
                    <dd className="body-sm text-on-surface">
                      + {formatCurrency(tranche.amount, payment.custodySummary!.currency)}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-outline-variant pt-3">
                  <dt className="body-md font-medium text-on-surface">Total autorizado</dt>
                  <dd className="body-lg font-semibold text-on-surface">
                    {formatCurrency(
                      payment.custodySummary.totalCommerciallyAuthorized,
                      payment.custodySummary.currency,
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="body-sm text-on-surface-variant">Em custódia hoje</dt>
                  <dd className="body-sm text-on-surface">
                    {formatCurrency(payment.custodySummary.totalHeld, payment.custodySummary.currency)}
                  </dd>
                </div>
                {payment.custodySummary.amountAuthorizedNotInCustody > 0 ? (
                  <div className="flex justify-between">
                    <dt className="body-sm text-on-surface-variant">Autorizado, ainda não custodiado</dt>
                    <dd className="body-sm text-on-surface">
                      {formatCurrency(
                        payment.custodySummary.amountAuthorizedNotInCustody,
                        payment.custodySummary.currency,
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          ) : null}

          {/*
            IP-017 — economia do Partner. `currentTrustFeeAmount`/`currentProviderNetBeforePspFees`
            só vêm preenchidos pela API quando quem chama é o prestador (PACK-03 §15) — a
            condição `isSeller` aqui é só uma checagem de UI redundante com essa regra de
            servidor, nunca a única barreira: o Member nunca recebe esses campos na resposta.
          */}
          {isSeller && serviceSummary && serviceSummary.currentProviderNetBeforePspFees !== undefined ? (
            <Card>
              <SectionTitle
                icon="payments"
                title={t('partner.earningsTitle')}
                hint={t('partner.earningsHint')}
              />
              <dl className="flex flex-col gap-3">
                <div className="flex justify-between">
                  <dt className="body-sm text-on-surface-variant">{t('partner.earningsGross')}</dt>
                  <dd className="body-sm text-on-surface">
                    {formatCurrency(serviceSummary.currentAuthorizedGrossAmount, serviceSummary.currency)}
                  </dd>
                </div>
                {serviceSummary.currentTrustFeeAmount !== undefined ? (
                  <div className="flex justify-between">
                    <dt className="body-sm text-on-surface-variant">{t('partner.earningsTrustFee')}</dt>
                    <dd className="body-sm text-on-surface">
                      - {formatCurrency(serviceSummary.currentTrustFeeAmount, serviceSummary.currency)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-outline-variant pt-3">
                  <dt className="body-md font-medium text-on-surface">{t('partner.earningsNet')}</dt>
                  <dd className="body-lg font-semibold text-on-surface">
                    {formatCurrency(serviceSummary.currentProviderNetBeforePspFees, serviceSummary.currency)}
                  </dd>
                </div>
              </dl>
              <p className="body-sm mt-3 text-on-surface-variant">{t('partner.earningsNetHint')}</p>
            </Card>
          ) : null}

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

              {/* IP-017 — Trust Pause: o relógio faturável para até o Partner retomar (§10.2/§10.3). */}
              {canPauseOrResume ? (
                isExecutionPaused ? (
                  <PrimaryButton type="button" loading={busy} onClick={() => void resumeExecution()}>
                    {t('partner.resumeButton')}
                  </PrimaryButton>
                ) : (
                  <SecondaryButton onClick={() => setPanel('pause')}>{t('partner.pauseButton')}</SecondaryButton>
                )
              ) : null}

              {/* IP-006 — evidência e nota de serviço, sempre opcionais. */}
              {canAddEvidenceOrNote ? (
                <SecondaryButton onClick={() => setPanel('evidence')}>
                  {t('partner.evidenceUploadTitle')}
                </SecondaryButton>
              ) : null}
              {canAddEvidenceOrNote ? (
                <SecondaryButton onClick={() => setPanel('note')}>{t('partner.noteAddTitle')}</SecondaryButton>
              ) : null}

              {/*
                PACK-03 §7 — o Partner só propõe; o valor autorizado só muda quando o Member
                aprova (ver o card "Alterações aguardando sua aprovação" e `decideChangeOrder`,
                exclusivos do Member). Nenhum caminho aqui aplica o valor sem essa aprovação.
              */}
              {canProposeChangeOrder ? (
                <SecondaryButton onClick={() => setPanel('changeOrder')}>
                  {t('partner.proposeChangeOrderButton')}
                </SecondaryButton>
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

          {/* IP-017 — declarar "a caminho" com ETA (IP-005, sem geolocalização). */}
          {panel === 'travel' ? (
            <Card>
              <SectionTitle icon="local_shipping" title={t('partner.travelDeclareEnRoute')} />
              <div className="flex flex-col gap-4">
                <Field id="eta" label={t('partner.travelEtaLabel')}>
                  <input
                    id="eta"
                    type="number"
                    min="1"
                    max="480"
                    className="tds-input"
                    value={etaMinutes}
                    onChange={(event) => setEtaMinutes(event.target.value)}
                  />
                </Field>
                <PrimaryButton type="button" loading={busy} onClick={() => void declareEnRoute()}>
                  {t('partner.travelDeclareEnRoute')}
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>{t('common.cancel')}</SecondaryButton>
              </div>
            </Card>
          ) : null}

          {/* IP-017 — Trust Pause: motivo obrigatório, nota opcional (§10.2). */}
          {panel === 'pause' ? (
            <Card>
              <SectionTitle icon="pause_circle" title={t('partner.pauseButton')} />
              <div className="flex flex-col gap-4">
                <Field id="pauseReason" label={t('partner.pauseReasonLabel')}>
                  <select
                    id="pauseReason"
                    className="tds-input"
                    value={pauseReason}
                    onChange={(event) =>
                      setPauseReason(event.target.value as (typeof PAUSE_REASONS)[number])
                    }
                  >
                    {PAUSE_REASONS.map((code) => (
                      <option key={code} value={code}>
                        {t(`partner.pauseReason.${code}` as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="pauseNote" label={t('partner.pauseNoteLabel')}>
                  <textarea
                    id="pauseNote"
                    className="tds-input min-h-20 resize-y"
                    value={pauseNote}
                    maxLength={500}
                    onChange={(event) => setPauseNote(event.target.value)}
                  />
                </Field>
                <PrimaryButton type="button" loading={busy} onClick={() => void pauseExecution()}>
                  {t('partner.pauseConfirm')}
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>{t('common.cancel')}</SecondaryButton>
              </div>
            </Card>
          ) : null}

          {/* IP-006 — evidência de execução, sempre opcional (multipart type+file). */}
          {panel === 'evidence' ? (
            <Card>
              <SectionTitle icon="photo_camera" title={t('partner.evidenceUploadTitle')} />
              <div className="flex flex-col gap-4">
                <Field id="evidenceType" label={t('partner.evidenceTypeLabel')}>
                  <select
                    id="evidenceType"
                    className="tds-input"
                    value={evidenceType}
                    onChange={(event) =>
                      setEvidenceType(event.target.value as (typeof EXECUTION_EVIDENCE_TYPES)[number])
                    }
                  >
                    {EXECUTION_EVIDENCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EXECUTION_EVIDENCE_TYPE_LABEL[type] ?? type}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="evidenceFile" label={t('partner.evidenceFileLabel')}>
                  <input
                    id="evidenceFile"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="tds-input"
                    onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                  />
                </Field>
                <PrimaryButton
                  type="button"
                  loading={busy}
                  disabled={!evidenceFile}
                  onClick={() => void uploadEvidence()}
                >
                  {t('partner.evidenceUploadButton')}
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>{t('common.cancel')}</SecondaryButton>
              </div>
            </Card>
          ) : null}

          {/* IP-006 — nota de serviço: texto livre do Partner, separado de disputa/avaliação. */}
          {panel === 'note' ? (
            <Card>
              <SectionTitle icon="edit_note" title={t('partner.noteAddTitle')} />
              <div className="flex flex-col gap-4">
                <Field id="noteBody" label={t('partner.noteBodyLabel')}>
                  <textarea
                    id="noteBody"
                    className="tds-input min-h-24 resize-y"
                    value={noteBody}
                    maxLength={2000}
                    onChange={(event) => setNoteBody(event.target.value)}
                  />
                </Field>
                <PrimaryButton
                  type="button"
                  loading={busy}
                  disabled={noteBody.trim().length < 1}
                  onClick={() => void addServiceNote()}
                >
                  {t('partner.noteAddButton')}
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>{t('common.cancel')}</SecondaryButton>
              </div>
            </Card>
          ) : null}

          {/*
            PACK-03 §7 — propor Change Order. Só cria + envia (submit); a aprovação/rejeição
            é exclusiva do Trust Member (`decideChangeOrder`, card acima). Nenhum valor
            autorizado muda aqui.
          */}
          {panel === 'changeOrder' ? (
            <Card>
              <SectionTitle icon="fact_check" title={t('partner.changeOrderProposeTitle')} />
              <div className="flex flex-col gap-4">
                <Banner kind="info">{t('partner.changeOrderProposeHint')}</Banner>
                <Field id="changeOrderType" label={t('partner.changeOrderTypeLabel')}>
                  <select
                    id="changeOrderType"
                    className="tds-input"
                    value={changeOrderType}
                    onChange={(event) =>
                      setChangeOrderType(event.target.value as (typeof CHANGE_ORDER_TYPES)[number])
                    }
                  >
                    {CHANGE_ORDER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {
                          {
                            ADDITIONAL_TIME: t('partner.changeOrderTypeAdditionalTime'),
                            SCOPE_CHANGE: t('partner.changeOrderTypeScopeChange'),
                            MATERIAL: t('partner.changeOrderTypeMaterial'),
                            MIXED: t('partner.changeOrderTypeMixed'),
                          }[type]
                        }
                      </option>
                    ))}
                  </select>
                </Field>
                {changeOrderType === 'ADDITIONAL_TIME' ? (
                  <Field id="changeOrderMinutes" label={t('partner.changeOrderAdditionalMinutesLabel')}>
                    <input
                      id="changeOrderMinutes"
                      type="number"
                      min="1"
                      max="1440"
                      className="tds-input"
                      value={changeOrderMinutes}
                      onChange={(event) => setChangeOrderMinutes(event.target.value)}
                    />
                  </Field>
                ) : (
                  <>
                    <Field id="changeOrderServiceDelta" label={t('partner.changeOrderServiceDeltaLabel')}>
                      <input
                        id="changeOrderServiceDelta"
                        type="number"
                        min="0"
                        step="0.01"
                        className="tds-input"
                        value={changeOrderServiceDelta}
                        onChange={(event) => setChangeOrderServiceDelta(event.target.value)}
                      />
                    </Field>
                    <Field id="changeOrderMaterialCost" label={t('partner.changeOrderMaterialCostLabel')}>
                      <input
                        id="changeOrderMaterialCost"
                        type="number"
                        min="0"
                        step="0.01"
                        className="tds-input"
                        value={changeOrderMaterialCost}
                        onChange={(event) => setChangeOrderMaterialCost(event.target.value)}
                      />
                    </Field>
                    <Field id="changeOrderMaterialMarkup" label={t('partner.changeOrderMaterialMarkupLabel')}>
                      <input
                        id="changeOrderMaterialMarkup"
                        type="number"
                        min="0"
                        step="0.01"
                        className="tds-input"
                        value={changeOrderMaterialMarkup}
                        onChange={(event) => setChangeOrderMaterialMarkup(event.target.value)}
                      />
                    </Field>
                  </>
                )}
                <Field id="changeOrderReason" label={t('partner.changeOrderReasonLabel')}>
                  <textarea
                    id="changeOrderReason"
                    className="tds-input min-h-20 resize-y"
                    value={changeOrderReason}
                    maxLength={1000}
                    onChange={(event) => setChangeOrderReason(event.target.value)}
                  />
                </Field>
                <Field id="changeOrderDescription" label={t('partner.changeOrderDescriptionLabel')}>
                  <textarea
                    id="changeOrderDescription"
                    className="tds-input min-h-20 resize-y"
                    value={changeOrderDescription}
                    maxLength={2000}
                    onChange={(event) => setChangeOrderDescription(event.target.value)}
                  />
                </Field>
                <PrimaryButton
                  type="button"
                  loading={busy}
                  disabled={changeOrderReason.trim().length < 3}
                  onClick={() => void createChangeOrder()}
                >
                  {t('partner.changeOrderSubmitButton')}
                </PrimaryButton>
                <SecondaryButton onClick={() => setPanel(null)}>{t('common.cancel')}</SecondaryButton>
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
