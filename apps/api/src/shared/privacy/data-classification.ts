/**
 * IP-021 — inventário de classificação de dados (Shared Standards §7 +
 * IP-021 spec §6 "sensitive categories mapped").
 *
 * Este NÃO é um mecanismo de runtime (nenhum código consulta esta tabela
 * para tomar decisão automática) — é o inventário estruturado, legível por
 * máquina, que documenta o que já foi verificado linha a linha nos schemas
 * reais do repositório (ver IP-021-COMPLETION-REPORT.md §2/§3 para a
 * evidência completa, tabela a tabela). Mantém o inventário perto do código
 * para não divergir da estrutura real do banco, e serve de referência única
 * para o mecanismo de anonimização (`RequestDataDeletionUseCase`) e para
 * qualquer revisão futura de conformidade.
 *
 * Categorias:
 * - IDENTIFYING_PII: identifica a pessoa diretamente (nome, e-mail, telefone,
 *   endereço). Alvo de anonimização quando uma exclusão é aprovada.
 * - SENSITIVE_KYC_EVIDENCE: documentos de verificação de identidade
 *   (arquivo em Storage + metadados). Retenção para prevenção a fraude/KYC é
 *   uma decisão jurídica que este agente NÃO tomou unilateralmente — ver
 *   Conflict Escalation IP-021-CONFLICT-VERIFICATION-EVIDENCE-RETENTION.md.
 * - FINANCIAL_LEGAL_RETAINED: nunca apagado/reescrito por esta IP. PII só
 *   aparece por referência de UUID (identity_id) — nunca denormalizada nas
 *   próprias linhas — então anonimizar `identities`/`trust_passports` já
 *   remove a PII visível a partir destas tabelas, sem tocar o valor/estado
 *   financeiro.
 * - AUDIT_RETAINED: `audit_logs`, imutável por trigger de banco (migration
 *   0001). Mesma lógica de referência-por-UUID do item anterior.
 * - LOCATION_PRECISE: coordenadas GPS reais capturadas em campo. Evidência
 *   operacional de execução do serviço (prova de check-in/check-out para
 *   disputa) — não é apagada automaticamente; ver retenção em §OPERATIONAL_EVIDENCE.
 * - LOCATION_COARSE: texto livre grosseiro ("Bairro, Cidade/UF"), sem
 *   coordenada — já é a granularidade mínima que o produto usa hoje.
 * - OPERATIONAL_EVIDENCE_RETAINED: eventos de execução/Change Order —
 *   append-only por design de domínio pré-existente (BR-007/BR-008 do MRK),
 *   preservados pela mesma razão de FINANCIAL_LEGAL_RETAINED.
 * - USER_GENERATED_CONTENT: texto livre digitado pelo usuário (mensagens,
 *   avaliações, comentários de disputa). Pode conter PII digitada
 *   voluntariamente por terceiros; não é escaneado/redigido automaticamente
 *   nesta IP (redação de texto livre é fora do escopo de uma fundação —
 *   documentado como gap conhecido, não como decisão pronta).
 * - SECURITY_CREDENTIAL: sessões/tokens — revogados/expirados no fluxo de
 *   exclusão, nunca exportados.
 * - PUBLIC_OR_DERIVED: dados já pensados para exposição pública (Trust
 *   Score, badges, listagens) ou totalmente derivados sem PII própria.
 */
export const DATA_CATEGORY = {
  IDENTIFYING_PII: 'IDENTIFYING_PII',
  SENSITIVE_KYC_EVIDENCE: 'SENSITIVE_KYC_EVIDENCE',
  FINANCIAL_LEGAL_RETAINED: 'FINANCIAL_LEGAL_RETAINED',
  AUDIT_RETAINED: 'AUDIT_RETAINED',
  LOCATION_PRECISE: 'LOCATION_PRECISE',
  LOCATION_COARSE: 'LOCATION_COARSE',
  OPERATIONAL_EVIDENCE_RETAINED: 'OPERATIONAL_EVIDENCE_RETAINED',
  USER_GENERATED_CONTENT: 'USER_GENERATED_CONTENT',
  SECURITY_CREDENTIAL: 'SECURITY_CREDENTIAL',
  PUBLIC_OR_DERIVED: 'PUBLIC_OR_DERIVED',
} as const;

export type DataCategory = (typeof DATA_CATEGORY)[keyof typeof DATA_CATEGORY];

export interface DataInventoryEntry {
  table: string;
  columns: string;
  category: DataCategory;
  /** O que acontece com esta linha quando o TITULAR pede exclusão (DATA_DELETION). */
  deletionBehavior:
    | 'ANONYMIZED'
    | 'NOT_TOUCHED_REFERENCE_ONLY'
    | 'REVOKED'
    | 'NOT_TOUCHED_ESCALATED'
    | 'NOT_TOUCHED_OUT_OF_SCOPE';
  notes: string;
}

export const DATA_INVENTORY: readonly DataInventoryEntry[] = [
  {
    table: 'identities',
    columns: 'full_name, email, password_hash',
    category: DATA_CATEGORY.IDENTIFYING_PII,
    deletionBehavior: 'ANONYMIZED',
    notes:
      'Fonte central de PII identificadora. anonymize() troca nome/e-mail por valor pseudônimo determinístico e invalida o hash de senha; deleted_at marca soft-delete (já previsto no schema desde a IP-000 baseline).',
  },
  {
    table: 'trust_passports',
    columns: 'phone, address_country, address_state, address_city',
    category: DATA_CATEGORY.IDENTIFYING_PII,
    deletionBehavior: 'ANONYMIZED',
    notes:
      'Campos de contato/endereço nulados; os booleanos *_verified e profile_completion são preservados como fato histórico de verificação (não são PII em si).',
  },
  {
    table: 'verifications / verification_reviews / verification_decisions',
    columns: 'todas',
    category: DATA_CATEGORY.SENSITIVE_KYC_EVIDENCE,
    deletionBehavior: 'NOT_TOUCHED_ESCALATED',
    notes:
      'Referenciam identity_id/trust_passport_id por UUID (sem PII denormalizada), mas representam o FATO de uma verificação de identidade concluída. Ver Conflict Escalation: reter para prevenção a fraude vs. anonimizar é decisão jurídica.',
  },
  {
    table: 'verification_evidences',
    columns: 'file_name, storage_key, checksum + conteúdo binário no Supabase Storage',
    category: DATA_CATEGORY.SENSITIVE_KYC_EVIDENCE,
    deletionBehavior: 'NOT_TOUCHED_ESCALATED',
    notes:
      'Documento de identidade em si (RG/CNH/comprovante). Mesma escalada acima — nenhuma operação de storage foi executada por esta IP.',
  },
  {
    table: 'payments, payment_authorizations, trust_custodies, payment_incremental_authorizations, incremental_trust_custodies',
    columns: 'buyer_id, seller_id (referência) + valores/estado',
    category: DATA_CATEGORY.FINANCIAL_LEGAL_RETAINED,
    deletionBehavior: 'NOT_TOUCHED_REFERENCE_ONLY',
    notes:
      'Nunca apagados/reescritos. Não guardam nome/e-mail — só UUID. Anonimizar identities já remove a PII visível a partir daqui sem tocar em nenhum valor financeiro.',
  },
  {
    table: 'audit_logs',
    columns: 'identity_id (referência) + operação/resultado',
    category: DATA_CATEGORY.AUDIT_RETAINED,
    deletionBehavior: 'NOT_TOUCHED_REFERENCE_ONLY',
    notes:
      'Imutável por trigger de banco (migration 0001, forbid_audit_log_mutation). Mesma lógica de referência-só-por-UUID.',
  },
  {
    table: 'marketplace_order_execution_events',
    columns: 'latitude, longitude, accuracy, address',
    category: DATA_CATEGORY.LOCATION_PRECISE,
    deletionBehavior: 'NOT_TOUCHED_REFERENCE_ONLY',
    notes:
      'GPS real de check-in/check-out (evidência de execução, BR-007: "nunca excluída"). Referenciado por performed_by (UUID); anonimizar a identity remove quem é a pessoa, mas a localização em si permanece como evidência operacional do pedido — política de retenção documentada, não uma alegação jurídica.',
  },
  {
    table: 'service_requests',
    columns: 'location_label, radius_km',
    category: DATA_CATEGORY.LOCATION_COARSE,
    deletionBehavior: 'NOT_TOUCHED_REFERENCE_ONLY',
    notes: 'Texto livre grosseiro ("Bairro, Cidade/UF"), já a granularidade mínima do produto.',
  },
  {
    table: 'trust_change_order_evidences, marketplace_order_execution_events, marketplace_confirmations',
    columns: 'metadados de evidência (arquivo em Storage referenciado por id)',
    category: DATA_CATEGORY.OPERATIONAL_EVIDENCE_RETAINED,
    deletionBehavior: 'NOT_TOUCHED_REFERENCE_ONLY',
    notes: 'Append-only por design de domínio pré-existente; mesma lógica de referência-só-por-UUID.',
  },
  {
    table: 'marketplace_reviews, marketplace_messages, marketplace_disputes (comentários)',
    columns: 'comment, body (texto livre)',
    category: DATA_CATEGORY.USER_GENERATED_CONTENT,
    deletionBehavior: 'NOT_TOUCHED_OUT_OF_SCOPE',
    notes:
      'Texto livre pode conter PII digitada voluntariamente por outra pessoa (ex.: um nome numa avaliação). Redação automática de texto livre é desproporcional para uma IP de fundação — gap conhecido, documentado no Completion Report, não uma decisão de retenção.',
  },
  {
    table: 'sessions, email_verification_tokens, password_reset_tokens',
    columns: 'todas',
    category: DATA_CATEGORY.SECURITY_CREDENTIAL,
    deletionBehavior: 'REVOKED',
    notes:
      'Sessões revogadas explicitamente (sessionRepository.revokeAllByIdentity); tokens de e-mail/senha já perdem efeito sozinhos porque toda consulta a identities filtra deleted_at IS NULL (nenhuma ação extra necessária — verificado nos usecases que os consultam).',
  },
  {
    table: 'trust_score, trust_events, trust_badges, marketplace_listings, marketplace_categories',
    columns: 'todas',
    category: DATA_CATEGORY.PUBLIC_OR_DERIVED,
    deletionBehavior: 'NOT_TOUCHED_REFERENCE_ONLY',
    notes:
      'Reputação/score é histórico agregado, referenciado por trust_passport_id; some do perfil público quando o Trust Passport correspondente é soft-deleted, sem precisar de tratamento próprio.',
  },
] as const;
