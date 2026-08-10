import {
  DECISION_TYPE_LABEL,
  DISPUTE_CATEGORY_LABEL,
  LEVEL_LABEL,
  VERIFICATION_TYPE_LABEL,
  formatMoney,
} from './notification-labels';

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
 * Regra de notificação: dado o payload de um evento, quem deve ser avisado e
 * com que texto. Retornar `[]` significa "este evento não gera aviso".
 */
export interface NotificationRule {
  eventName: string;
  consumerName: string;
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
    eventName: 'Verification.Approved',
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
    eventName: 'Verification.Rejected',
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
    eventName: 'TrustLevel.Changed',
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
    eventName: 'TrustBadge.Awarded',
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
    eventName: 'MarketplaceMessage.Sent',
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
    eventName: 'MarketplaceOffer.Created',
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
    eventName: 'MarketplaceOffer.Countered',
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
    eventName: 'MarketplaceOffer.Accepted',
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
    eventName: 'MarketplaceOffer.Rejected',
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
    eventName: 'MarketplaceOffer.Withdrawn',
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
    eventName: 'MarketplaceOrder.Scheduled',
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
    eventName: 'MarketplaceOrder.Started',
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
    eventName: 'MarketplaceOrder.ExecutionCompleted',
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
    eventName: 'MarketplaceOrder.CustomerConfirmed',
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
    eventName: 'MarketplaceOrder.Cancelled',
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
    eventName: 'MarketplaceDispute.Opened',
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
    eventName: 'MarketplaceDispute.Resolved',
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
    eventName: 'MarketplaceReview.Created',
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
