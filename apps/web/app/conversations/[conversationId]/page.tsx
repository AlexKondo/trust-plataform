'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, useIdentity } from '../../../components/app-shell';
import {
  Card,
  ErrorState,
  Loading,
  PageHeader,
  Pill,
  SectionTitle,
  toneForStatus,
} from '../../../components/layout';
import { Banner, Field, Icon, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi } from '../../../lib/api';
import {
  OFFER_STATUS_LABEL,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '../../../lib/labels';
import type { Conversation, Message, Offer } from '../../../lib/types';

interface ThreadData {
  conversation: Conversation;
  messages: Message[];
}

/** Data de hoje + N dias no formato aceito pelo input datetime-local. */
function defaultExpiry(days = 7): string {
  const date = new Date(Date.now() + days * 86400000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function ThreadContent() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const identity = useIdentity();
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Formulário de proposta / contraproposta
  const [offerForm, setOfferForm] = useState<{ mode: 'new' | 'counter'; parentId?: string } | null>(
    null,
  );
  const [amount, setAmount] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const [data, offerList] = await Promise.all([
        authApi<ThreadData>(`/marketplace/conversations/${params.conversationId}`),
        authApi<Offer[]>(`/marketplace/conversations/${params.conversationId}/offers`).catch(
          () => [] as Offer[],
        ),
      ]);
      setThread(data);
      setOffers(offerList);
      // Marca como lidas ao abrir (silencioso: não bloqueia a tela)
      void authApi(`/marketplace/conversations/${params.conversationId}/read`, { method: 'PATCH' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível abrir a conversa.');
    }
  }, [params.conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      await authApi(`/marketplace/conversations/${params.conversationId}/messages`, {
        method: 'POST',
        body: { message: draft },
      });
      setDraft('');
      await load();
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível enviar.',
      });
    } finally {
      setSending(false);
    }
  };

  const submitOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!offerForm) return;
    setBusy(true);
    setFeedback(null);
    const body = {
      amount: Number(amount),
      expiresAt: new Date(expiresAt).toISOString(),
      notes: notes.trim() || undefined,
    };
    try {
      if (offerForm.mode === 'counter' && offerForm.parentId) {
        await authApi(`/marketplace/offers/${offerForm.parentId}/counter`, {
          method: 'POST',
          body,
        });
      } else {
        await authApi(`/marketplace/conversations/${params.conversationId}/offers`, {
          method: 'POST',
          body: { ...body, quantity: 1 },
        });
      }
      setOfferForm(null);
      setAmount('');
      setNotes('');
      await load();
      setFeedback({ kind: 'success', text: 'Proposta enviada.' });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível enviar a proposta.',
      });
    } finally {
      setBusy(false);
    }
  };

  const actOnOffer = async (offerId: string, action: 'accept' | 'reject' | 'withdraw') => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await authApi<{ order?: { orderId: string } }>(
        `/marketplace/offers/${offerId}/${action}`,
        { method: 'POST', body: action === 'accept' ? undefined : {} },
      );
      if (action === 'accept' && result?.order) {
        router.push(`/orders/${result.order.orderId}`);
        return;
      }
      await load();
      setFeedback({
        kind: 'success',
        text: action === 'reject' ? 'Proposta recusada.' : 'Proposta retirada.',
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Operação não permitida agora.',
      });
    } finally {
      setBusy(false);
    }
  };

  const closeConversation = async () => {
    setBusy(true);
    try {
      await authApi(`/marketplace/conversations/${params.conversationId}/close`, {
        method: 'POST',
        body: {},
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!thread) {
    return <Loading label="Abrindo conversa..." />;
  }

  const me = identity?.identityId;
  const isBuyer = me === thread.conversation.buyerId;
  const isOpen = thread.conversation.status === 'OPEN';
  const liveOffer = offers.find((offer) => offer.status === 'PENDING');
  const acceptedOffer = offers.find((offer) => offer.status === 'ACCEPTED');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={thread.conversation.listingTitle ?? 'Conversa'}
        subtitle={isBuyer ? 'Você é o cliente nesta negociação' : 'Você é o prestador nesta negociação'}
        back={{ href: '/conversations', label: 'Todas as conversas' }}
        action={
          isOpen ? (
            <SecondaryButton onClick={() => void closeConversation()} disabled={busy}>
              Encerrar conversa
            </SecondaryButton>
          ) : (
            <Pill>Conversa encerrada</Pill>
          )
        }
      />

      {feedback ? (
        <Banner kind={feedback.kind === 'success' ? 'success' : 'error'}>{feedback.text}</Banner>
      ) : null}

      {acceptedOffer ? (
        <Banner kind="success" icon="handshake">
          Negociação fechada em {formatCurrency(acceptedOffer.amount, acceptedOffer.currency)}.{' '}
          <Link href="/orders" className="font-semibold underline">
            Ver pedido
          </Link>
        </Banner>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Mensagens */}
        <div className="lg:col-span-2">
          <Card padded={false} className="flex h-[32rem] flex-col">
            <div className="flex-1 overflow-y-auto p-5">
              <ul className="flex flex-col gap-3">
                {thread.messages.map((message) => {
                  const mine = message.senderId === me;
                  return (
                    <li
                      key={message.messageId}
                      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-4 py-3 ${
                          mine
                            ? 'bg-primary-container text-on-primary'
                            : 'bg-surface-container text-on-surface'
                        }`}
                      >
                        <p className="body-sm whitespace-pre-line">{message.message}</p>
                        <p
                          className={`mt-1 text-[11px] ${
                            mine ? 'text-on-primary-container' : 'text-on-surface-variant'
                          }`}
                        >
                          {formatDateTime(message.sentAt)}
                          {mine && message.read ? ' · lida' : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {isOpen ? (
              <form
                className="flex items-end gap-3 border-t border-outline-variant p-4"
                onSubmit={(event) => void sendMessage(event)}
              >
                <textarea
                  className="tds-input min-h-12 flex-1 resize-none py-3"
                  placeholder="Escreva uma mensagem..."
                  value={draft}
                  maxLength={2000}
                  rows={1}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="btn-text flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary transition-colors hover:bg-primary disabled:opacity-50"
                  aria-label="Enviar"
                >
                  <Icon name={sending ? 'progress_activity' : 'send'} size={20} />
                </button>
              </form>
            ) : (
              <div className="border-t border-outline-variant p-4 text-center">
                <p className="body-sm text-on-surface-variant">
                  Esta conversa foi encerrada. O histórico continua disponível.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Negociação */}
        <div className="flex flex-col gap-6">
          <Card>
            <SectionTitle
              icon="handshake"
              title="Negociação"
              hint={
                offers.length === 0
                  ? 'Nenhuma proposta ainda.'
                  : `${offers.length} ${offers.length === 1 ? 'rodada' : 'rodadas'}`
              }
            />

            {offers.length > 0 ? (
              <ul className="mb-4 flex flex-col gap-3">
                {offers.map((offer) => {
                  const iCanDecide = offer.recipientId === me && offer.status === 'PENDING';
                  const iCanWithdraw = offer.createdBy === me && offer.status === 'PENDING';
                  return (
                    <li
                      key={offer.offerId}
                      className="rounded-lg border border-outline-variant p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="body-lg font-semibold text-on-surface">
                          {formatCurrency(offer.amount, offer.currency)}
                        </span>
                        <Pill tone={toneForStatus(offer.status)}>
                          {OFFER_STATUS_LABEL[offer.status] ?? offer.status}
                        </Pill>
                      </div>
                      <p className="body-sm mt-1 text-on-surface-variant">
                        {offer.createdBy === me ? 'Você propôs' : 'Proposta recebida'} ·{' '}
                        {offer.status === 'PENDING'
                          ? `válida até ${formatDate(offer.expiresAt)}`
                          : formatDate(offer.createdAt)}
                      </p>
                      {offer.notes ? (
                        <p className="body-sm mt-2 text-on-surface">{offer.notes}</p>
                      ) : null}
                      {offer.rejectReason ? (
                        <p className="body-sm mt-2 text-on-surface-variant">
                          Motivo: {offer.rejectReason}
                        </p>
                      ) : null}

                      {isOpen && (iCanDecide || iCanWithdraw) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {iCanDecide ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void actOnOffer(offer.offerId, 'accept')}
                                className="btn-text rounded-lg bg-primary-container px-3 py-2 text-xs text-on-primary hover:bg-primary disabled:opacity-60"
                              >
                                Aceitar
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setOfferForm({ mode: 'counter', parentId: offer.offerId });
                                  setAmount(String(offer.amount));
                                }}
                                className="btn-text rounded-lg border border-outline-variant px-3 py-2 text-xs text-on-surface hover:bg-surface-container-low"
                              >
                                Contrapropor
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void actOnOffer(offer.offerId, 'reject')}
                                className="btn-text rounded-lg px-3 py-2 text-xs text-error hover:bg-error-container/40 disabled:opacity-60"
                              >
                                Recusar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void actOnOffer(offer.offerId, 'withdraw')}
                              className="btn-text rounded-lg px-3 py-2 text-xs text-error hover:bg-error-container/40 disabled:opacity-60"
                            >
                              Retirar proposta
                            </button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {offerForm ? (
              <form className="flex flex-col gap-4" onSubmit={(event) => void submitOffer(event)}>
                <Field id="amount" label="Valor (R$)">
                  <input
                    id="amount"
                    className="tds-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </Field>
                <Field id="expiresAt" label="Válida até">
                  <input
                    id="expiresAt"
                    className="tds-input"
                    type="datetime-local"
                    required
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </Field>
                <Field id="notes" label="Observações">
                  <textarea
                    id="notes"
                    className="tds-input min-h-20 resize-y"
                    value={notes}
                    maxLength={2000}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
                <PrimaryButton loading={busy} loadingLabel="Enviando...">
                  {offerForm.mode === 'counter' ? 'Enviar contraproposta' : 'Enviar proposta'}
                </PrimaryButton>
                <SecondaryButton onClick={() => setOfferForm(null)}>Cancelar</SecondaryButton>
              </form>
            ) : isOpen && isBuyer && !liveOffer && !acceptedOffer ? (
              <PrimaryButton
                type="button"
                onClick={() => {
                  setOfferForm({ mode: 'new' });
                  setExpiresAt(defaultExpiry());
                }}
              >
                Fazer uma proposta
              </PrimaryButton>
            ) : null}

            {isOpen && !isBuyer && offers.length === 0 ? (
              <p className="body-sm text-on-surface-variant">
                O cliente é quem abre a negociação com uma proposta. Você poderá aceitar, recusar ou
                contrapor.
              </p>
            ) : null}
          </Card>

          <Card>
            <SectionTitle icon="storefront" title="Anúncio" />
            <Link
              href={`/marketplace/${thread.conversation.listingId}`}
              className="body-sm flex items-center gap-1 text-primary hover:underline"
            >
              Ver anúncio completo
              <Icon name="arrow_forward" size={16} />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ConversationPage() {
  return (
    <AppShell>
      <ThreadContent />
    </AppShell>
  );
}
