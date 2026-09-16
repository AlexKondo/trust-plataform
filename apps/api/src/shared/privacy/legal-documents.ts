/**
 * IP-021 — catálogo de documentos legais sujeitos a captura de
 * consentimento/versão (Shared Standards §7: "user-facing consent/legal
 * text must be externalized/i18n-ready").
 *
 * O TEXTO em si (o conteúdo real dos termos/política) é conteúdo de produto
 * PLACEHOLDER — este agente não é advogado e não redige texto legal final
 * (IP-021 spec §4 "no unsupported legal claims"). O que este arquivo
 * garante é a MECÂNICA: toda vez que o documento muda de versão, o backend
 * sabe qual é a versão atual e pode exigir/recapturar consentimento; o
 * texto real vive no catálogo i18n do frontend (`apps/web/lib/i18n/messages`,
 * chave `privacy.legal.*`), pronto para tradução, igual a qualquer outro
 * conteúdo novo desta plataforma (IP-002).
 */
export const LEGAL_DOCUMENT_TYPES = {
  TERMS_OF_SERVICE: 'TERMS_OF_SERVICE',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
} as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[keyof typeof LEGAL_DOCUMENT_TYPES];

export const LEGAL_DOCUMENT_TYPE_VALUES = Object.values(LEGAL_DOCUMENT_TYPES) as [
  LegalDocumentType,
  ...LegalDocumentType[],
];

/**
 * Versão vigente de cada documento. Subir a versão aqui (uma troca de
 * código, não de config de runtime — mesma filosofia de `SUPPORTED_LOCALES`
 * em IP-002) é o gatilho para pedir um novo aceite explícito na próxima vez
 * que o usuário passar pela tela de configurações de privacidade; nada
 * força retroativamente sessões já abertas a re-aceitar.
 */
export const CURRENT_LEGAL_DOCUMENT_VERSION: Record<LegalDocumentType, string> = {
  TERMS_OF_SERVICE: 'v1',
  PRIVACY_POLICY: 'v1',
};
