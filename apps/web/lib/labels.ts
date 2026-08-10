/**
 * Tradução dos enums da API para a linguagem do produto.
 * A API fala UPPER_SNAKE_CASE (DOC-001); a tela fala português.
 */

export const LEVEL_LABEL: Record<string, string> = {
  UNVERIFIED: 'Não verificado',
  BRONZE: 'Bronze',
  SILVER: 'Prata',
  GOLD: 'Ouro',
  PLATINUM: 'Platina',
};

/** Faixas da escala 0–1000 (seed do TRS-008) para desenhar o progresso. */
export const LEVEL_RANGE: Record<string, { min: number; max: number }> = {
  UNVERIFIED: { min: 0, max: 0 },
  BRONZE: { min: 1, max: 249 },
  SILVER: { min: 250, max: 499 },
  GOLD: { min: 500, max: 749 },
  PLATINUM: { min: 750, max: 1000 },
};

export const LEVEL_ORDER = ['UNVERIFIED', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

export const VERIFICATION_TYPE_LABEL: Record<string, string> = {
  DOCUMENT: 'Documento de identidade',
  ADDRESS: 'Comprovante de endereço',
  PHONE: 'Telefone',
  EMAIL: 'E-mail',
  BANK_ACCOUNT: 'Conta bancária',
  BUSINESS: 'Empresa',
  BIOMETRIC: 'Biometria facial',
};

export const VERIFICATION_STATUS_LABEL: Record<string, string> = {
  WAITING_FOR_EVIDENCE: 'Aguardando envio',
  PENDING_REVIEW: 'Em fila de análise',
  IN_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

export const LISTING_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  RESERVED: 'Reservado',
  SUSPENDED: 'Suspenso',
  EXPIRED: 'Expirado',
  REMOVED: 'Removido',
};

export const OFFER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando resposta',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
  WITHDRAWN: 'Retirada',
  COUNTERED: 'Respondida com contraproposta',
  EXPIRED: 'Expirada',
  CLOSED: 'Encerrada',
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Criado',
  AWAITING_SCHEDULING: 'Aguardando agendamento',
  SCHEDULED: 'Agendado',
  AWAITING_EXECUTION: 'Aguardando execução',
  IN_PROGRESS: 'Em andamento',
  AWAITING_CUSTOMER_CONFIRMATION: 'Aguardando sua confirmação',
  CUSTOMER_CONFIRMED: 'Confirmado pelo cliente',
  COMPLETED: 'Concluído',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
  DISPUTE_OPEN: 'Em disputa',
  DISPUTE_RESOLVED: 'Disputa resolvida',
  REFUNDED: 'Reembolsado',
};

/** O que a plataforma espera agora (MRK-016 BR-004). */
export const NEXT_ACTION_LABEL: Record<string, string> = {
  AWAITING_SCHEDULING: 'Combine a data do serviço',
  AWAITING_SERVICE_START: 'Aguardando o início do serviço',
  AWAITING_SERVICE_COMPLETION: 'Serviço em andamento',
  AWAITING_CUSTOMER_CONFIRMATION: 'O cliente precisa confirmar a conclusão',
  PROCESSING_COMPLETION: 'Finalizando o pedido',
  AWAITING_REVIEW: 'Avalie a transação',
  AWAITING_DISPUTE_RESOLUTION: 'Disputa em análise pela plataforma',
  NONE: 'Nada pendente',
};

export const TIMELINE_LABEL: Record<string, string> = {
  ORDER_CREATED: 'Pedido criado',
  SCHEDULED: 'Serviço agendado',
  CHECK_IN: 'Prestador iniciou o serviço',
  CHECK_OUT: 'Prestador concluiu o serviço',
  CUSTOMER_CONFIRMED: 'Cliente confirmou a conclusão',
  ORDER_COMPLETED: 'Pedido concluído',
  CANCELLED: 'Pedido cancelado',
};

export const DISPUTE_CATEGORY_LABEL: Record<string, string> = {
  SERVICE_NOT_COMPLETED: 'Serviço não concluído',
  SERVICE_PARTIALLY_EXECUTED: 'Serviço executado parcialmente',
  PRODUCT_DIVERGENT: 'Produto divergente',
  PRODUCT_DAMAGED: 'Produto danificado',
  IMPROPER_CHARGE: 'Cobrança indevida',
  INAPPROPRIATE_CONDUCT: 'Conduta inadequada',
  OTHER: 'Outro',
};

export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  IN_ANALYSIS: 'Em análise',
  MEDIATION: 'Em mediação',
  RESOLVED: 'Resolvida',
};

export const DECISION_TYPE_LABEL: Record<string, string> = {
  UPHELD: 'Procedente',
  PARTIALLY_UPHELD: 'Parcialmente procedente',
  REJECTED: 'Improcedente',
  SETTLED: 'Acordo entre as partes',
  CANCELLED: 'Disputa cancelada',
};

export const REVIEW_CRITERION_LABEL: Record<string, string> = {
  quality: 'Qualidade',
  communication: 'Comunicação',
  punctuality: 'Pontualidade',
  costBenefit: 'Custo-benefício',
  organization: 'Organização',
};

/** Eventos do Trust Score em linguagem de negócio (timeline explicável). */
export const TRUST_EVENT_LABEL: Record<string, string> = {
  'TrustPassport.Created': 'Conta ativada',
  'Verification.Approved': 'Verificação aprovada',
  'Verification.Rejected': 'Verificação rejeitada',
  'MarketplaceOrder.CustomerConfirmed': 'Serviço concluído e confirmado',
  'MarketplaceOrder.Cancelled': 'Pedido cancelado',
  'MarketplaceReview.Created': 'Avaliação recebida',
  'MarketplaceDispute.Resolved': 'Disputa resolvida',
};

export const LISTING_TYPE_LABEL: Record<string, string> = {
  SERVICE: 'Serviço',
  PRODUCT: 'Produto',
};

export function formatCurrency(value: number | null, currency = 'BRL'): string {
  if (value === null) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

export function formatDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}

export function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** "há 3 dias" — para listas de conversas e timelines. */
export function formatRelative(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return formatDate(iso);
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) {
    return '—';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}
