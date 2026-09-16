import { Injectable } from '@nestjs/common';
import { ETA_SOURCE } from '../../domain/entities/marketplace-types';
import { EtaEstimate, EtaEstimateInput, EtaEstimatorPort } from '../../domain/ports/eta-estimator.port';

/**
 * IP-005 — implementação Release-1 do `EtaEstimatorPort`: NÃO computa
 * geo-roteamento (nenhum provedor de mapas está configurado, `.env.example`
 * confirmado sem nenhuma chave de geocoding/roteamento) — apenas valida e
 * passa adiante a estimativa que o próprio Partner declarou, honestamente
 * marcada como `PARTNER_DECLARED`. Isto é deliberado: fingir precisão que não
 * existe (ex.: inventar um ETA "calculado" a partir de nada) seria pior do
 * que ser explícito sobre a fonte real do número.
 *
 * Trocar por um provedor real no futuro é só registrar outra classe atrás
 * deste mesmo `EtaEstimatorPort` em `marketplace.module.ts` — nenhum código
 * de domínio ou de use case muda.
 */
@Injectable()
export class DeclaredEtaAdapter extends EtaEstimatorPort {
  async estimate(input: EtaEstimateInput): Promise<EtaEstimate> {
    return Promise.resolve({
      source: ETA_SOURCE.PARTNER_DECLARED,
      etaMinutes: input.declaredEtaMinutes,
      estimatedArrivalAt: new Date(input.now.getTime() + input.declaredEtaMinutes * 60000),
    });
  }
}
