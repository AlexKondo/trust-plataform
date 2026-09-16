import { EtaSource } from '../entities/marketplace-types';

/**
 * IP-005 — porta de estimativa de chegada. Existe para que "como calculamos o
 * ETA" nunca vaze para dentro do domínio/use case: hoje (Release 1) a única
 * implementação é `DeclaredEtaAdapter` (nenhum fornecedor de mapas está
 * configurado — ver `.env.example`, sem nenhuma chave de geocoding/roteamento).
 * Quando um provedor real (Google/Mapbox/OSRM/etc.) for contratado, a troca é
 * só trocar o provider ligado a este token no `marketplace.module.ts` — nenhum
 * use case, controller ou entidade muda.
 */
export interface EtaEstimateInput {
  orderId: string;
  partnerId: string;
  /** Minutos que o Partner declarou manualmente ("estou a 15 min"). Fonte de
   * verdade na Release 1 — nenhum roteamento geográfico é computado. */
  declaredEtaMinutes: number;
  now: Date;
}

export interface EtaEstimate {
  source: EtaSource;
  etaMinutes: number;
  estimatedArrivalAt: Date;
}

export abstract class EtaEstimatorPort {
  abstract estimate(input: EtaEstimateInput): Promise<EtaEstimate>;
}
