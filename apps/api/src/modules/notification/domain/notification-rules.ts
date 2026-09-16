import {
  DECISION_TYPE_LABEL,
  DISPUTE_CATEGORY_LABEL,
  LEVEL_LABEL,
  VERIFICATION_TYPE_LABEL,
  formatMoney,
} from './notification-labels';
import { NOTIFICATION_CATEGORY, NotificationCategory } from './notification-types';

/** Uma notificação a ser criada — já resolvida para um destinatário. */
export interface NotificationDraft {
  identityId: string;
  type: string;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
}

/**
 * IP-002 — draft com o locale do destinatário já resolvido, pronto para
 * persistência. A resolução (preferência do destinatário → PT-BR default)
 * é responsabilidade do consumer, não da regra: a regra descreve QUEM e O
 * QUÊ, o consumer decide EM QUE IDIOMA gravar.
 */
export interface LocalizedNotificationDraft extends NotificationDraft {
  locale: string;
}

/**
 * Regra de notificação: dado o payload de um evento, quem deve ser avisado e
 * com que texto. Retornar `[]` significa "este evento não gera aviso".
 */
export interface NotificationRule {
  eventType: string;
  consumerName: string;
  /**
   * IP-013 — TRANSACTIONAL (padrão quando omitido) vs OPTIONAL. Toda regra
   * hoje neste catálogo é TRANSACTIONAL (decorre de um fato da própria
   * transação/conta do destinatário) — omitir o campo é equivalente a
   * declará-lo explicitamente, não um valor "esquecido". Ver
   * `notification-types.ts` para por que não existe opt-out no MVP.
   */
  category?: NotificationCategory;
  build(payload: Record<string, unknown>): NotificationDraft[];
}

const str = (payload: Record<string, unknown>, key: string): string | null => {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const num = (payload: Record<string, unknown>, key: string): number | null => {
  const value = payload[key];
  return typeof value === 'number' ? value : null;
};

/** Monta um draft só quando há destinatário — evita aviso órfão. */
function to(
  identityId: string | null,
  draft: Omit<NotificationDraft, 'identityId'>,
): NotificationDraft[] {
  return identityId ? [{ identityId, ...draft }] : [];
}

/**
 * Catálogo de avisos do MVP. Está numa tabela (e não em 17 classes quase
 * idênticas) porque a única coisa que varia entre eles é destinatário e texto.
 */
export const NOTIFICATION_RULES: NotificationRule[] = [
  // ── Verificações ──────────────────────────────────────────────────────────
  {
    eventType: 'Verification.Approved',
    consumerName: 'ntf.verification-approved',
    build: (payload) =>
      to(str(payload, 'identityId'), {
        type: 'VERIFICATION_APPROVED',
        title: 'Verificação aprovada',
        body: `Sua verificação de ${VERIFICATION_TYPE_LABEL[str(payload, 'type') ?? ''] ?? 'documento'} foi aprovada. Os pontos já entraram no seu Trust Score.`,
        resourceType: 'Verification',
        resourceId: str(payload, 'verificationId'),
      }),
  },
  {
    eventType: 'Verification.Rejected',
    consumerName: 'ntf.verification-rejected',
    build: (payload) =>
      to(str(payload, 'identityId'), {
        type: 'VERIFICATION_REJECTED',
        title: 'Verificação rejeitada',
        body: `Sua verificação de ${VERIFICATION_TYPE_LABEL[str(payload, 'type') ?? ''] ?? 'documento'} não foi aprovada. Veja o motivo e tente novamente.`,
        resourceType: 'Verification',
        resourceId: str(payload, 'verificationId'),
      }),
  },

  // ── Trust Layer ───────────────────────────────────────────────────────────
  {
    eventType: 'TrustLevel.Changed',
    consumerName: 'ntf.trust-level-changed',
    build: (payload) => {
      const newLevel = str(payload, 'newLevel');
      const previous = str(payload, 'previousLevel');
      if (!newLevel) {
        return [];
      }
      // Só comemoramos subida; queda não vira push na cara do usuário.
      const isPromotion = rankOf(newLevel) > rankOf(previous);
      if (!isPromotion) {
        return [];
      }
      return to(str(payload, 'identityId'), {
        type: 'TRUST_LEVEL_UP',
        title: `Você chegou ao nível ${LEVEL_LABEL[newLevel] ?? newLevel}`,
        body: 'Seu histórico na plataforma subiu de patamar — novas categorias e benefícios foram liberados.',
        resourceType: 'TrustScore',
        resourceId: null,
      });
    },
  },
  {
    eventType: 'TrustBadge.Awarded',
    consumerName: 'ntf.badge-awarded',
    build: (payload) =>
      to(str(payload, 'identityId'), {
        type: 'BADGE_AWARDED',
        title: 'Novo selo conquistado',
        body: `Você recebeu o selo ${str(payload, 'badgeCode') ?? ''}. Ele aparece no seu perfil público.`,
        resourceType: 'TrustScore',
        resourceId: null,
      }),
  },

  // ── Conversas ─────────────────────────────────────────────────────────────
  {
    eventType: 'MarketplaceMessage.Sent',
    consumerName: 'ntf.message-sent',
    build: (payload) =>
      to(str(payload, 'recipientId'), {
        type: 'MESSAGE_RECEIVED',
        title: 'Nova mensagem',
        body: 'Você recebeu uma mensagem em uma das suas negociações.',
        resourceType: 'MarketplaceConversation',
        resourceId: str(payload, 'conversationId'),
      }),
  },

  // ── Propostas ─────────────────────────────────────────────────────────────
  {
    eventType: 'MarketplaceOffer.Created',
    consumerName: 'ntf.offer-created',
    build: (payload) =>
      to(str(payload, 'sellerId'), {
        type: 'OFFER_RECEIVED',
        title: 'Você recebeu uma proposta',
        body: `Proposta de ${formatMoney(num(payload, 'amount'), str(payload, 'currency'))}. Aceite, recuse ou faça uma contraproposta.`,
        resourceType: 'MarketplaceConversation',
        resourceId: str(payload, 'conversationId'),
      }),
  },
  {
    eventType: 'MarketplaceOffer.Countered',
    consumerName: 'ntf.offer-countered',
    build: (payload) =>
      // A contraoferta é do vendedor: quem recebe é o comprador.
      to(str(payload, 'buyerId'), {
        type: 'OFFER_COUNTERED',
        title: 'Contraproposta recebida',
        body: `A outra parte propôs ${formatMoney(num(payload, 'amount'), str(payload, 'currency'))}.`,
        resourceType: 'MarketplaceConversation',
        resourceId: str(payload, 'conversationId'),
      }),
  },
  {
    eventType: 'MarketplaceOffer.Accepted',
    consumerName: 'ntf.offer-accepted',
    build: (payload) => {
      const acceptedBy = str(payload, 'acceptedBy');
      const buyer = str(payload, 'buyerId');
      const seller = str(payload, 'sellerId');
      // Avisa quem NÃO decidiu — quem aceitou já sabe.
      const recipient = acceptedBy === buyer ? seller : buyer;
      return to(recipient, {
        type: 'OFFER_ACCEPTED',
        title: 'Proposta aceita',
        body: 'A negociação foi fechada e o pedido já foi criado.',
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      });
    },
  },
  {
    eventType: 'MarketplaceOffer.Rejected',
    consumerName: 'ntf.offer-rejected',
    build: (payload) => {
      const rejectedBy = str(payload, 'rejectedBy');
      const buyer = str(payload, 'buyerId');
      const seller = str(payload, 'sellerId');
      return to(rejectedBy === buyer ? seller : buyer, {
        type: 'OFFER_REJECTED',
        title: 'Proposta recusada',
        body: 'Sua proposta não foi aceita, mas a conversa continua aberta para uma nova rodada.',
        resourceType: 'MarketplaceConversation',
        resourceId: str(payload, 'conversationId'),
      });
    },
  },
  {
    eventType: 'MarketplaceOffer.Withdrawn',
    consumerName: 'ntf.offer-withdrawn',
    build: (payload) =>
      to(str(payload, 'sellerId'), {
        type: 'OFFER_WITHDRAWN',
        title: 'Proposta retirada',
        body: 'O cliente retirou a proposta que estava em aberto.',
        resourceType: 'MarketplaceConversation',
        resourceId: str(payload, 'conversationId'),
      }),
  },

  // ── Pedidos ───────────────────────────────────────────────────────────────
  {
    eventType: 'MarketplaceOrder.Scheduled',
    consumerName: 'ntf.order-scheduled',
    build: (payload) =>
      to(str(payload, 'sellerId'), {
        type: 'ORDER_SCHEDULED',
        title: 'Serviço agendado',
        body: 'Um serviço foi agendado. Confira a data no pedido.',
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      }),
  },
  {
    eventType: 'MarketplaceOrder.Started',
    consumerName: 'ntf.order-started',
    build: (payload) =>
      to(str(payload, 'buyerId'), {
        type: 'ORDER_STARTED',
        title: 'Serviço iniciado',
        body: 'O prestador registrou o início do serviço.',
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      }),
  },
  {
    eventType: 'MarketplaceOrder.ExecutionCompleted',
    consumerName: 'ntf.order-execution-completed',
    build: (payload) =>
      to(str(payload, 'buyerId'), {
        type: 'ORDER_AWAITING_CONFIRMATION',
        title: 'Confirme a conclusão do serviço',
        body: 'O prestador concluiu o serviço. Confirme para liberar o encerramento do pedido.',
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      }),
  },
  {
    eventType: 'MarketplaceOrder.CustomerConfirmed',
    consumerName: 'ntf.order-confirmed',
    build: (payload) =>
      to(str(payload, 'sellerId'), {
        type: 'ORDER_CONFIRMED',
        title: 'Cliente confirmou a conclusão',
        body: 'O serviço foi confirmado e os pontos de confiança entraram no seu score.',
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      }),
  },
  {
    eventType: 'MarketplaceOrder.Cancelled',
    consumerName: 'ntf.order-cancelled',
    build: (payload) => {
      const cancelledBy = str(payload, 'cancelledBy');
      const buyer = str(payload, 'buyerId');
      const seller = str(payload, 'sellerId');
      return to(cancelledBy === buyer ? seller : buyer, {
        type: 'ORDER_CANCELLED',
        title: 'Pedido cancelado',
        body: `A outra parte cancelou o pedido. Motivo: ${str(payload, 'reason') ?? 'não informado'}.`,
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      });
    },
  },

  // ── Disputas e avaliações ─────────────────────────────────────────────────
  {
    eventType: 'MarketplaceDispute.Opened',
    consumerName: 'ntf.dispute-opened',
    build: (payload) => {
      const openedBy = str(payload, 'openedBy');
      const buyer = str(payload, 'buyerId');
      const seller = str(payload, 'sellerId');
      return to(openedBy === buyer ? seller : buyer, {
        type: 'DISPUTE_OPENED',
        title: 'Disputa aberta no seu pedido',
        body: `Motivo informado: ${DISPUTE_CATEGORY_LABEL[str(payload, 'category') ?? ''] ?? 'não informado'}. A plataforma vai analisar.`,
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      });
    },
  },
  {
    eventType: 'MarketplaceDispute.Resolved',
    consumerName: 'ntf.dispute-resolved',
    build: (payload) => {
      const decision = DECISION_TYPE_LABEL[str(payload, 'decisionType') ?? ''] ?? 'registrada';
      const orderId = str(payload, 'orderId');
      // As duas partes são avisadas: a decisão afeta ambas.
      return [str(payload, 'buyerId'), str(payload, 'sellerId')]
        .filter((identityId): identityId is string => Boolean(identityId))
        .map((identityId) => ({
          identityId,
          type: 'DISPUTE_RESOLVED',
          title: 'Disputa resolvida',
          body: `A plataforma decidiu: ${decision}.`,
          resourceType: 'MarketplaceOrder',
          resourceId: orderId,
        }));
    },
  },
  {
    eventType: 'MarketplaceReview.Created',
    consumerName: 'ntf.review-created',
    build: (payload) => {
      const score = num(payload, 'overallScore');
      return to(str(payload, 'reviewedUserId'), {
        type: 'REVIEW_RECEIVED',
        title: 'Você recebeu uma avaliação',
        body: score
          ? `Nota ${score} de 5. A avaliação já entrou no seu Trust Score.`
          : 'Uma nova avaliação entrou no seu Trust Score.',
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      });
    },
  },
  // ── Mudança comercial (PACK-03) ───────────────────────────────────────────
  {
    eventType: 'TrustChangeOrder.Submitted',
    consumerName: 'ntf.change-order-submitted',
    build: (payload) =>
      to(str(payload, 'buyerId'), {
        type: 'CHANGE_ORDER_SUBMITTED',
        title: 'Mudança no serviço aguarda sua aprovação',
        body: `O prestador pediu ${formatMoney(num(payload, 'changeGrossAmount'), str(payload, 'currency'))} a mais. Nada é cobrado enquanto você não aprovar.`,
        resourceType: 'TrustChangeOrder',
        resourceId: str(payload, 'changeOrderId'),
      }),
  },
  {
    eventType: 'TrustChangeOrder.Approved',
    consumerName: 'ntf.change-order-approved',
    // Quem aprovou é o cliente; avisamos o prestador (regra: nunca o próprio ator).
    build: (payload) =>
      to(str(payload, 'sellerId'), {
        type: 'CHANGE_ORDER_APPROVED',
        title: 'Mudança aprovada pelo cliente',
        body: `O cliente aprovou ${formatMoney(num(payload, 'changeGrossAmount'), str(payload, 'currency'))} a mais neste serviço.`,
        resourceType: 'TrustChangeOrder',
        resourceId: str(payload, 'changeOrderId'),
      }),
  },
  {
    eventType: 'TrustChangeOrder.Rejected',
    consumerName: 'ntf.change-order-rejected',
    build: (payload) =>
      to(str(payload, 'sellerId'), {
        type: 'CHANGE_ORDER_REJECTED',
        title: 'Mudança recusada pelo cliente',
        body: 'O cliente não aprovou a mudança. O valor do contrato continua o mesmo.',
        resourceType: 'TrustChangeOrder',
        resourceId: str(payload, 'changeOrderId'),
      }),
  },

  // ── Pedido de serviço (IP-003) ───────────────────────────────────────────
  // ServiceRequest.Created/Matched/Closed/Cancelled não geram aviso: o ator de
  // toda transição é sempre o próprio Member dono do pedido (regra "o autor
  // nunca é notificado do próprio ato"), e o Partner engajado já é avisado
  // pela mensagem que o mesmo engajamento cria (MarketplaceMessage.Sent →
  // ntf.message-sent). ServiceRequestEngagement.Created é o único evento
  // deste agregado com um destinatário distinto do ator: dá ao Partner um
  // aviso com o CONTEXTO do pedido de serviço (não só "nova mensagem").
  {
    eventType: 'ServiceRequestEngagement.Created',
    consumerName: 'ntf.service-request-engagement-created',
    category: NOTIFICATION_CATEGORY.TRANSACTIONAL,
    build: (payload) =>
      to(str(payload, 'partnerId'), {
        type: 'SERVICE_REQUEST_ENGAGEMENT_RECEIVED',
        title: 'Um Trust Member entrou em contato',
        body: 'Um Trust Member viu seu anúncio e entrou em contato a partir de um pedido de serviço. Confira a conversa.',
        resourceType: 'ServiceRequestEngagement',
        resourceId: str(payload, 'serviceRequestId'),
      }),
  },

  // ── Pagamento (IP-007 / PAY) ─────────────────────────────────────────────
  // Payment.Created/Authorized não geram aviso próprio: já ficam implícitos
  // em OFFER_ACCEPTED (a negociação fechada JÁ diz "o pedido foi criado e
  // pago"); duplicar seria repetir o mesmo fato duas vezes (fora de escopo:
  // "no spam engine"). AuthorizationFailed é diferente — é um desfecho ruim
  // que o comprador precisa saber para agir (tentar de novo / trocar cartão).
  {
    eventType: 'Payment.AuthorizationFailed',
    consumerName: 'ntf.payment-authorization-failed',
    category: NOTIFICATION_CATEGORY.TRANSACTIONAL,
    build: (payload) =>
      to(str(payload, 'buyerId'), {
        type: 'PAYMENT_AUTHORIZATION_FAILED',
        title: 'Não foi possível autorizar o pagamento',
        body: 'O pagamento deste pedido não foi autorizado pela operadora. Tente novamente ou use outro método de pagamento.',
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      }),
  },
  {
    eventType: 'PaymentIncrementalAuthorization.Approved',
    consumerName: 'ntf.incremental-payment-approved',
    category: NOTIFICATION_CATEGORY.TRANSACTIONAL,
    build: (payload) =>
      to(str(payload, 'buyerId'), {
        type: 'INCREMENTAL_PAYMENT_APPROVED',
        title: 'Cobrança adicional autorizada',
        body: `A cobrança adicional de ${formatMoney(num(payload, 'amount'), str(payload, 'currency'))}, referente à mudança que você aprovou, foi autorizada com sucesso.`,
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      }),
  },
  {
    eventType: 'PaymentIncrementalAuthorization.Failed',
    consumerName: 'ntf.incremental-payment-failed',
    category: NOTIFICATION_CATEGORY.TRANSACTIONAL,
    build: (payload) =>
      to(str(payload, 'buyerId'), {
        type: 'INCREMENTAL_PAYMENT_FAILED',
        title: 'Não foi possível autorizar a cobrança adicional',
        body: `Não conseguimos autorizar a cobrança adicional de ${formatMoney(num(payload, 'amount'), str(payload, 'currency'))} referente à mudança que você aprovou. Verifique seu método de pagamento.`,
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      }),
  },
  {
    eventType: 'Funds.Released',
    consumerName: 'ntf.funds-released',
    category: NOTIFICATION_CATEGORY.TRANSACTIONAL,
    build: (payload) =>
      to(str(payload, 'sellerId'), {
        type: 'FUNDS_RELEASED',
        title: 'Pagamento liberado',
        body: `O pagamento de ${formatMoney(num(payload, 'amount'), str(payload, 'currency'))} foi liberado para você.`,
        resourceType: 'MarketplaceOrder',
        resourceId: str(payload, 'orderId'),
      }),
  },

  // ── Segurança da conta (IDN) ─────────────────────────────────────────────
  // Identity.Authenticated/Session.* não geram aviso — login/logout normal
  // são rotineiros demais para virar notificação (spam). Mudança/recuperação
  // de SENHA é diferente: é o tipo de evento que, se não foi o próprio
  // usuário, ele precisa ver o quanto antes.
  {
    eventType: 'Identity.PasswordChanged',
    consumerName: 'ntf.password-changed',
    category: NOTIFICATION_CATEGORY.TRANSACTIONAL,
    build: (payload) =>
      to(str(payload, 'identityId'), {
        type: 'PASSWORD_CHANGED',
        title: 'Sua senha foi alterada',
        body: 'A senha da sua conta foi alterada agora há pouco. Se não foi você, contate o suporte imediatamente.',
        resourceType: 'Identity',
        resourceId: null,
      }),
  },
  {
    eventType: 'Identity.PasswordRecoveryRequested',
    consumerName: 'ntf.password-recovery-requested',
    category: NOTIFICATION_CATEGORY.TRANSACTIONAL,
    build: (payload) =>
      to(str(payload, 'identityId'), {
        type: 'PASSWORD_RECOVERY_REQUESTED',
        title: 'Redefinição de senha solicitada',
        body: 'Foi solicitada uma redefinição de senha para a sua conta. Se não foi você, ignore o link enviado por e-mail — sua senha atual continua válida.',
        resourceType: 'Identity',
        resourceId: null,
      }),
  },
];

const LEVEL_RANK: Record<string, number> = {
  UNVERIFIED: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
};

function rankOf(level: string | null): number {
  return level ? (LEVEL_RANK[level] ?? -1) : -1;
}
