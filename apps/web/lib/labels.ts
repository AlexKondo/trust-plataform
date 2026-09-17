/**
 * Tradução dos enums da API para a linguagem do produto.
 * A API fala UPPER_SNAKE_CASE (DOC-001); a tela fala português.
 *
 * IP-002: as funções `format*` abaixo delegam para `lib/i18n/format.ts`
 * (locale-aware, `Intl`) sempre com locale fixo 'pt-BR' — nenhuma das ~25
 * telas existentes muda de comportamento. Telas novas que precisam seguir o
 * locale do usuário corrente devem chamar `lib/i18n/format.ts` diretamente
 * com o `locale` do `useLocale()`, em vez de importar daqui.
 */
import {
  formatCurrency as formatCurrencyForLocale,
  formatDate as formatDateForLocale,
  formatDateTime as formatDateTimeForLocale,
} from './i18n/format';

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

// ── IP-003: pedido de serviço (ServiceRequest) ──────────────────────────────
export const URGENCY_LABEL: Record<string, string> = {
  IMMEDIATE: 'Imediata',
  THIS_WEEK: 'Esta semana',
  FLEXIBLE: 'Sou flexível',
};

export const SERVICE_REQUEST_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Em aberto',
  MATCHED: 'Com propostas',
  ENGAGED: 'Em negociação',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
};

// ── IP-005: status de deslocamento do Partner ───────────────────────────────
export const TRAVEL_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Ainda não saiu',
  EN_ROUTE: 'A caminho',
  ARRIVED: 'Chegou ao local',
};

// ── PACK-03: Trust Change Order ─────────────────────────────────────────────
export const CHANGE_ORDER_TYPE_LABEL: Record<string, string> = {
  ADDITIONAL_TIME: 'Tempo adicional',
  ADDITIONAL_MATERIAL: 'Material adicional',
  SCOPE_CHANGE: 'Mudança de escopo',
};

export const CHANGE_ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_APPROVAL: 'Aguardando sua aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
};

// ── IP-006: evidência de execução ───────────────────────────────────────────
export const EXECUTION_EVIDENCE_TYPE_LABEL: Record<string, string> = {
  BEFORE_PHOTO: 'Foto de antes',
  AFTER_PHOTO: 'Foto de depois',
  DOCUMENT: 'Documento',
  OTHER: 'Outro',
};

// ── IP-007: status de autorização/custódia incremental ──────────────────────
export const AUTHORIZATION_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  AUTHORIZED: 'Autorizado',
  DECLINED: 'Recusado',
  EXPIRED: 'Expirado',
};

export const CUSTODY_STATUS_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'Não aplicável',
  PENDING: 'Pendente',
  HELD: 'Em custódia',
  RELEASED: 'Liberado',
  REFUNDED: 'Reembolsado',
};

/** Sempre PT-BR aqui — mesmo output de antes, só que passando pelo utilitário compartilhado. */
export function formatCurrency(value: number | null, currency = 'BRL'): string {
  return formatCurrencyForLocale(value, 'pt-BR', currency);
}

/**
 * Data válida ou null. `Intl.format` LANÇA em data inválida — sem esta guarda,
 * um campo ausente na resposta derruba a página inteira. (Guarda vive em
 * `lib/i18n/format.ts`; mantida aqui só como referência do motivo do '—'.)
 */
function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(iso: string | null | undefined): string {
  return formatDateForLocale(iso, 'pt-BR');
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDateTimeForLocale(iso, 'pt-BR');
}

/**
 * "há 3 dias" — para listas de conversas e timelines. Implementação PRÓPRIA
 * (não delega para `lib/i18n/format.ts`) para preservar exatamente a
 * abreviação usada nas ~25 telas existentes ("há 3 min", não "3 minutos
 * atrás" do `Intl.RelativeTimeFormat` pt-BR) — mudar o texto aqui seria um
 * refactor de tela fora do escopo desta IP. A versão locale-aware para
 * telas novas fica em `lib/i18n/format.ts`.
 */
export function formatRelative(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) {
    return '—';
  }
  const diff = Date.now() - date.getTime();
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
