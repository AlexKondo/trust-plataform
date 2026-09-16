import { v7 as uuidv7 } from 'uuid';
import {
  ServiceRequestNotEngageableException,
  ServiceRequestOwnershipException,
  ServiceRequestTransitionException,
  ServiceRequestValidationException,
} from '../exceptions/marketplace.exceptions';
import {
  SERVICE_REQUEST_ENGAGEABLE_STATUSES,
  SERVICE_REQUEST_STATUS,
  SERVICE_REQUEST_TRANSITIONS,
  ServiceRequestStatus,
  UrgencyLevel,
} from './marketplace-types';

export interface ServiceRequestProps {
  id: string;
  memberId: string;
  categoryId: string;
  title: string;
  description: string;
  /**
   * IP-003 — representação de localização PRIVACY-SAFE por construção: só o
   * rótulo livre e grosseiro ("Bairro, Cidade/UF"), o mesmo formato que
   * `MarketplaceListing.location` já usa hoje. Deliberadamente NÃO existe
   * latitude/longitude neste agregado — ver ServiceRequest §"privacidade" no
   * IP-003-COMPLETION-REPORT.md §11: a busca do Marketplace inteiro (MRK-004)
   * já é só texto livre, sem geocoding (IP-000 §14, linha IP-015).
   *
   * Correção (Diff Review §F/§J.2): NÃO é verdade que "nenhuma coordenada de
   * Partner existe no repositório" — `marketplace_order_execution_events`
   * (migration 0017, PACK-03) guarda latitude/longitude real do Partner,
   * capturada no check-in/check-out da execução em campo. O que de fato não
   * existe é um perfil de localização do Partner PRÉ-engajamento, associável a
   * um `ServiceRequest` para matching prospectivo: aquele dado só nasce depois
   * que um pedido já chegou à execução, é um evento pontual (não uma "base" do
   * Partner) e reaproveitá-lo para matching exigiria infraestrutura de
   * agregação nova, fora do escopo desta IP. A decisão de não introduzir
   * coordenadas precisas aqui continua correta e é a mais conservadora do
   * ponto de vista de privacidade — só a justificativa foi corrigida.
   */
  locationLabel: string;
  /** Raio desejado em km — capturado como preferência declarada (BR do IP-003:
   * "categoria/localização/raio/tempo"); não é usado em cálculo geométrico
   * nesta IP porque não existe um perfil de localização do Partner
   * pré-engajamento para comparar (ver justificativa completa acima). */
  radiusKm: number | null;
  urgency: UrgencyLevel;
  /** Data desejada opcional — sinal simples, não é uma agenda (IP-005). */
  preferredDate: Date | null;
  budgetMinAmount: number | null;
  budgetMaxAmount: number | null;
  currency: string;
  /** Nível mínimo de reputação exigido do Partner — mesmo vocabulário do MRK-004. */
  minimumTrustLevel: string | null;
  status: ServiceRequestStatus;
  expiresAt: Date;
  matchedAt: Date | null;
  closedAt: Date | null;
  closedBy: string | null;
  closeReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceRequestCreateInput {
  memberId: string;
  categoryId: string;
  title: string;
  description: string;
  locationLabel: string;
  radiusKm?: number | null;
  urgency: UrgencyLevel;
  preferredDate?: Date | null;
  budgetMinAmount?: number | null;
  budgetMaxAmount?: number | null;
  currency?: string;
  minimumTrustLevel?: string | null;
  /** Default: 30 dias a partir de agora (nenhum job de expiração — ver EXPIRED derivado). */
  expiresAt?: Date;
}

const DEFAULT_LIFETIME_DAYS = 30;

/**
 * Aggregate root do pedido de serviço do Trust Member (IP-003).
 *
 * Escopo deliberadamente pequeno: nasce completo (não existe rascunho — ao
 * contrário de MarketplaceListing, este agregado nunca é publicamente
 * navegável, só o próprio Member o lê, então não há por que o modelar em duas
 * fases). Vive só até o Member escolher um Partner; dali em diante o que
 * governa a transação é o ciclo já existente de
 * MarketplaceConversation/MarketplaceOffer/MarketplaceOrder — este agregado
 * não duplica esse ciclo, só registra a origem do primeiro contato
 * (ServiceRequestEngagement, ver drizzle-service-request.repository.ts).
 *
 * Invariantes: pertence a um único Member e nunca troca de dono; toda mudança
 * de status passa por `transitionTo` (nunca salta estado); `EXPIRED` nunca é
 * persistido, é sempre derivado de `expiresAt` (mesmo padrão de
 * `MarketplaceOffer.effectiveStatus`).
 */
export class ServiceRequest {
  private constructor(private readonly props: ServiceRequestProps) {}

  static create(input: ServiceRequestCreateInput, now = new Date()): ServiceRequest {
    assertBudget(input.budgetMinAmount ?? null, input.budgetMaxAmount ?? null);
    const expiresAt =
      input.expiresAt ?? new Date(now.getTime() + DEFAULT_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
    if (expiresAt.getTime() <= now.getTime()) {
      throw new ServiceRequestValidationException('expiresAt must be in the future.');
    }

    return new ServiceRequest({
      id: uuidv7(),
      memberId: input.memberId,
      categoryId: input.categoryId,
      title: input.title.trim(),
      description: input.description.trim(),
      locationLabel: input.locationLabel.trim(),
      radiusKm: input.radiusKm ?? null,
      urgency: input.urgency,
      preferredDate: input.preferredDate ?? null,
      budgetMinAmount: input.budgetMinAmount ?? null,
      budgetMaxAmount: input.budgetMaxAmount ?? null,
      currency: input.currency ?? 'BRL',
      minimumTrustLevel: input.minimumTrustLevel ?? null,
      status: SERVICE_REQUEST_STATUS.OPEN,
      expiresAt,
      matchedAt: null,
      closedAt: null,
      closedBy: null,
      closeReason: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: ServiceRequestProps): ServiceRequest {
    return new ServiceRequest(props);
  }

  get id(): string {
    return this.props.id;
  }

  get memberId(): string {
    return this.props.memberId;
  }

  get categoryId(): string {
    return this.props.categoryId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string {
    return this.props.description;
  }

  get locationLabel(): string {
    return this.props.locationLabel;
  }

  get radiusKm(): number | null {
    return this.props.radiusKm;
  }

  get urgency(): UrgencyLevel {
    return this.props.urgency;
  }

  get preferredDate(): Date | null {
    return this.props.preferredDate;
  }

  get budgetMinAmount(): number | null {
    return this.props.budgetMinAmount;
  }

  get budgetMaxAmount(): number | null {
    return this.props.budgetMaxAmount;
  }

  get currency(): string {
    return this.props.currency;
  }

  get minimumTrustLevel(): string | null {
    return this.props.minimumTrustLevel;
  }

  get status(): ServiceRequestStatus {
    return this.props.status;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get matchedAt(): Date | null {
    return this.props.matchedAt;
  }

  get closedAt(): Date | null {
    return this.props.closedAt;
  }

  get closedBy(): string | null {
    return this.props.closedBy;
  }

  get closeReason(): string | null {
    return this.props.closeReason;
  }

  get cancelledAt(): Date | null {
    return this.props.cancelledAt;
  }

  get cancelledBy(): string | null {
    return this.props.cancelledBy;
  }

  get cancellationReason(): string | null {
    return this.props.cancellationReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isOwnedBy(identityId: string): boolean {
    return this.props.memberId === identityId;
  }

  assertOwner(identityId: string): void {
    if (!this.isOwnedBy(identityId)) {
      throw new ServiceRequestOwnershipException();
    }
  }

  isExpired(now = new Date()): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }

  /** Status para leitura: OPEN/MATCHED vencido é apresentado como EXPIRED (nunca persistido). */
  effectiveStatus(now = new Date()): ServiceRequestStatus {
    const isOpenOrMatched =
      this.props.status === SERVICE_REQUEST_STATUS.OPEN ||
      this.props.status === SERVICE_REQUEST_STATUS.MATCHED;
    if (isOpenOrMatched && this.isExpired(now)) {
      return SERVICE_REQUEST_STATUS.EXPIRED;
    }
    return this.props.status;
  }

  /** Pedido ainda aceita novo engajamento com Partner (nem terminal, nem vencido). */
  isEngageable(now = new Date()): boolean {
    return (
      SERVICE_REQUEST_ENGAGEABLE_STATUSES.includes(this.props.status) && !this.isExpired(now)
    );
  }

  assertEngageable(now = new Date()): void {
    if (!this.isEngageable(now)) {
      throw new ServiceRequestNotEngageableException(this.effectiveStatus(now));
    }
  }

  canTransitionTo(target: ServiceRequestStatus): boolean {
    return SERVICE_REQUEST_TRANSITIONS[this.props.status].includes(target);
  }

  /** Porta única de mudança de status (mesmo padrão de MarketplaceOrder.transitionTo). */
  transitionTo(target: ServiceRequestStatus, now = new Date()): void {
    if (!this.canTransitionTo(target)) {
      throw new ServiceRequestTransitionException(this.props.status, target);
    }
    this.props.status = target;
    this.props.updatedAt = now;
  }

  /**
   * Primeiro engajamento com um Partner elegível. Idempotente por design: um
   * segundo/terceiro engajamento (outro Partner, ou o mesmo de novo) não é
   * erro — MATCHED só sinaliza "já houve pelo menos um contato", não reserva
   * exclusividade (isso é papel do MarketplaceListing.reserve() no aceite da
   * proposta, fora do escopo desta IP).
   */
  markMatched(now = new Date()): void {
    if (this.props.status === SERVICE_REQUEST_STATUS.OPEN) {
      this.transitionTo(SERVICE_REQUEST_STATUS.MATCHED, now);
      this.props.matchedAt = now;
    } else if (this.props.status !== SERVICE_REQUEST_STATUS.MATCHED) {
      throw new ServiceRequestTransitionException(this.props.status, SERVICE_REQUEST_STATUS.MATCHED);
    }
  }

  /** O Member fecha o pedido (ex.: resolveu por fora, achou o Partner certo). */
  close(closedBy: string, reason: string | null, now = new Date()): void {
    this.assertOwner(closedBy);
    this.transitionTo(SERVICE_REQUEST_STATUS.CLOSED, now);
    this.props.closedAt = now;
    this.props.closedBy = closedBy;
    this.props.closeReason = reason?.trim() || null;
  }

  /** O Member desiste do pedido; motivo obrigatório (mesmo padrão de MarketplaceOrder.cancel). */
  cancel(cancelledBy: string, reason: string, now = new Date()): void {
    this.assertOwner(cancelledBy);
    this.transitionTo(SERVICE_REQUEST_STATUS.CANCELLED, now);
    this.props.cancelledAt = now;
    this.props.cancelledBy = cancelledBy;
    this.props.cancellationReason = reason.trim();
  }

  toProps(): ServiceRequestProps {
    return { ...this.props };
  }
}

/** budgetMin/budgetMax, quando ambos presentes, precisam formar uma faixa válida. */
function assertBudget(min: number | null, max: number | null): void {
  if (min !== null && max !== null && min > max) {
    throw new ServiceRequestValidationException('budgetMinAmount cannot be greater than budgetMaxAmount.');
  }
}
