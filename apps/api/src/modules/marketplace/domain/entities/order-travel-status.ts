import { v7 as uuidv7 } from 'uuid';
import { OrderTravelTransitionException } from '../exceptions/marketplace.exceptions';
import { EtaEstimate } from '../ports/eta-estimator.port';
import { EtaSource, TRAVEL_STATUS, TravelStatus } from './marketplace-types';

export interface OrderTravelStatusProps {
  id: string;
  orderId: string;
  status: TravelStatus;
  declaredEtaMinutes: number | null;
  estimatedArrivalAt: Date | null;
  etaSource: EtaSource | null;
  enRouteAt: Date | null;
  arrivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * IP-005 — status de deslocamento do Partner (NOT_STARTED -> EN_ROUTE ->
 * ARRIVED). Modelo de TRANSIÇÃO DECLARADA, não rastreamento de GPS: o Partner
 * diz "saí, chego em ~X min" e depois "cheguei" — nenhuma coordenada é lida
 * neste agregado (ver marketplace-types.ts §TRAVEL_STATUS para a justificativa
 * completa de privacidade). O Member consulta este status para saber o
 * progresso da chegada sem que o sistema precise (ou queira) rastrear a
 * posição contínua do Partner — exatamente o "sem vazar localização precisa
 * contínua além da necessidade" do mandato desta IP.
 *
 * Não é um novo estado do pedido (MRK-017 continua com sua própria máquina):
 * deslocamento é fato PARALELO ao pedido, do mesmo jeito que `Trust Pause`
 * (PACK-03) é fato paralelo à sessão de execução sem virar estado do pedido.
 */
export class OrderTravelStatus {
  private constructor(private readonly props: OrderTravelStatusProps) {}

  /** Representação em memória, NÃO persistida, para quando nenhum registro existe ainda. */
  static notStarted(orderId: string, now = new Date()): OrderTravelStatus {
    return new OrderTravelStatus({
      id: uuidv7(),
      orderId,
      status: TRAVEL_STATUS.NOT_STARTED,
      declaredEtaMinutes: null,
      estimatedArrivalAt: null,
      etaSource: null,
      enRouteAt: null,
      arrivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: OrderTravelStatusProps): OrderTravelStatus {
    return new OrderTravelStatus(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get status(): TravelStatus {
    return this.props.status;
  }

  get declaredEtaMinutes(): number | null {
    return this.props.declaredEtaMinutes;
  }

  get estimatedArrivalAt(): Date | null {
    return this.props.estimatedArrivalAt;
  }

  get etaSource(): EtaSource | null {
    return this.props.etaSource;
  }

  get enRouteAt(): Date | null {
    return this.props.enRouteAt;
  }

  get arrivedAt(): Date | null {
    return this.props.arrivedAt;
  }

  /**
   * "Saí" — permitido a partir de NOT_STARTED, e IDEMPOTENTE a partir de
   * EN_ROUTE (o Partner pode redeclarar/atualizar o ETA quantas vezes quiser
   * antes de chegar; isso não é uma transição de estado nova, é uma
   * atualização de dado dentro do mesmo estado).
   */
  markEnRoute(estimate: EtaEstimate, now = new Date()): void {
    if (this.props.status !== TRAVEL_STATUS.NOT_STARTED && this.props.status !== TRAVEL_STATUS.EN_ROUTE) {
      throw new OrderTravelTransitionException(this.props.status, TRAVEL_STATUS.EN_ROUTE);
    }
    if (this.props.status === TRAVEL_STATUS.NOT_STARTED) {
      this.props.enRouteAt = now;
    }
    this.props.status = TRAVEL_STATUS.EN_ROUTE;
    this.props.declaredEtaMinutes = estimate.etaMinutes;
    this.props.estimatedArrivalAt = estimate.estimatedArrivalAt;
    this.props.etaSource = estimate.source;
    this.props.updatedAt = now;
  }

  /** "Cheguei" — só a partir de EN_ROUTE; terminal. */
  markArrived(now = new Date()): void {
    if (this.props.status !== TRAVEL_STATUS.EN_ROUTE) {
      throw new OrderTravelTransitionException(this.props.status, TRAVEL_STATUS.ARRIVED);
    }
    this.props.status = TRAVEL_STATUS.ARRIVED;
    this.props.arrivedAt = now;
    this.props.updatedAt = now;
  }

  toProps(): OrderTravelStatusProps {
    return { ...this.props };
  }
}
