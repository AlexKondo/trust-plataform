/**
 * Rótulos em português usados no TEXTO das notificações.
 * Vivem aqui (e não no frontend) porque o corpo do aviso é persistido no
 * momento do evento: o histórico precisa continuar legível mesmo que os
 * catálogos mudem depois.
 */

export const VERIFICATION_TYPE_LABEL: Record<string, string> = {
  DOCUMENT: 'documento de identidade',
  ADDRESS: 'endereço',
  PHONE: 'telefone',
  EMAIL: 'e-mail',
  BANK_ACCOUNT: 'conta bancária',
  BUSINESS: 'empresa',
  BIOMETRIC: 'biometria',
};

export const LEVEL_LABEL: Record<string, string> = {
  UNVERIFIED: 'Não verificado',
  BRONZE: 'Bronze',
  SILVER: 'Prata',
  GOLD: 'Ouro',
  PLATINUM: 'Platina',
};

export const DISPUTE_CATEGORY_LABEL: Record<string, string> = {
  SERVICE_NOT_COMPLETED: 'serviço não concluído',
  SERVICE_PARTIALLY_EXECUTED: 'serviço executado parcialmente',
  PRODUCT_DIVERGENT: 'produto divergente',
  PRODUCT_DAMAGED: 'produto danificado',
  IMPROPER_CHARGE: 'cobrança indevida',
  INAPPROPRIATE_CONDUCT: 'conduta inadequada',
  OTHER: 'outro',
};

export const DECISION_TYPE_LABEL: Record<string, string> = {
  UPHELD: 'procedente',
  PARTIALLY_UPHELD: 'parcialmente procedente',
  REJECTED: 'improcedente',
  SETTLED: 'acordo entre as partes',
  CANCELLED: 'disputa cancelada',
};

/** Valor monetário para o corpo do aviso; sem valor, devolve texto neutro. */
export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) {
    return 'um valor';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency ?? 'BRL',
  }).format(amount);
}
