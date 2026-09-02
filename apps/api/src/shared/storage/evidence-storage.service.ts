export interface StoredEvidence {
  storageKey: string;
}

export interface UploadEvidenceInput {
  /** Bucket de destino — quem chama declara onde o arquivo mora. */
  bucket: string;
  storageKey: string;
  content: Buffer;
  mimeType: string;
}

/**
 * Armazenamento seguro de evidências (VRF-002 BR-004; PACK-03 §13).
 *
 * Estava dentro do módulo `verification` até o PACK-03. Foi promovido ao shared
 * kernel porque o Trust Change Order também precisa anexar arquivo (foto do
 * problema, nota do fornecedor) e a alternativa — pendurar essa evidência na
 * tabela `verification_evidences` — corromperia a semântica do agregado
 * Verification, que é sobre verificação de IDENTIDADE (§13).
 *
 * O que é compartilhado é só o TRANSPORTE: cada domínio mantém sua própria
 * tabela de metadados e seu próprio bucket. Conteúdo nunca aparece em log.
 */
export abstract class EvidenceStorageService {
  abstract upload(input: UploadEvidenceInput): Promise<StoredEvidence>;
}
