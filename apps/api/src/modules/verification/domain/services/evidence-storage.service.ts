export interface StoredEvidence {
  storageKey: string;
}

/**
 * Armazenamento seguro de evidências (VRF-002 BR-004).
 * Implementações: Supabase Storage (produção) e memória (testes/CI).
 * Conteúdo NUNCA aparece em logs; download futuro será por signed URL (VRF-006 BR-005).
 */
export abstract class EvidenceStorageService {
  abstract upload(input: {
    storageKey: string;
    content: Buffer;
    mimeType: string;
  }): Promise<StoredEvidence>;
}
