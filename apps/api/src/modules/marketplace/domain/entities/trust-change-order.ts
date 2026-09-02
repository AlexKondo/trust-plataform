import { v7 as uuidv7 } from 'uuid';
import { applyBasisPoints, fromReais, toReais } from '../../../../shared/money/money';
import {
  TrustChangeOrderTransitionException,
  TrustChangeOrderValidationException,
} from '../exceptions/marketplace.exceptions';
import {
  CHANGE_ORDER_STATUS,
  CHANGE_ORDER_TRANSITIONS,
  CHANGE_ORDER_TYPE,
  ChangeOrderStatus,
  ChangeOrderType,
  PRICING_MODEL,
  PricingModel,
} from './marketplace-types';

export interface TrustChangeOrderProps {
  id: string;
  orderId: string;
  proposedBy: string;
  type: ChangeOrderType;
  status: ChangeOrderStatus;
  currency: string;
  additionalMinutes: number | null;
  serviceDeltaAmount: number;
  materialCostDeltaAmount: number;
  materialMarkupDeltaAmount: number;
  /** Taxa CONGELADA do contrato (§8) — nunca a política global vigente. */
  trustFeeRateBps: number;
  changeGrossAmount: number;
  changeTrustFeeBaseAmount: number;
  changeTrustFeeAmount: number;
  changeProviderNetBeforePspFees: number;
  reason: string;
  description: string | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  decisionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Termos comerciais congelados do Trust Contract que o Change Order é obrigado
 * a respeitar (§7.1/§8). Vêm do snapshot do PACK-02 — nunca de uma consulta
 * nova à `CommercialPolicy`.
 */
export interface FrozenContractTerms {
  pricingModel: PricingModel;
  currency: string;
  hourlyRateAmount: number | null;
  billingIncrementMinutes: number | null;
  trustFeeRateBps: number;
}

export interface CreateChangeOrderInput {
  orderId: string;
  proposedBy: string;
  type: ChangeOrderType;
  contract: FrozenContractTerms;
  additionalMinutes?: number | null;
  serviceDeltaAmount?: number;
  materialCostDeltaAmount?: number;
  materialMarkupDeltaAmount?: number;
  reason: string;
  description?: string | null;
  expiresAt?: Date | null;
  now?: Date;
}

const MAX_ADDITIONAL_MINUTES = 24 * 60;

/**
 * PACK-03 §6/§7/§8 — Trust Change Order.
 *
 * É o mecanismo que sustenta a promessa central do Pack: **o Trust Partner
 * nunca aumenta sozinho a conta do Trust Member**. Nada aqui altera o snapshot
 * inicial do PACK-02 (§5) — o total corrente é o snapshot MAIS a soma dos
 * Change Orders aprovados, calculada por `authorized-commercial.service.ts`.
 *
 * Duas escolhas que valem explicação:
 *
 * 1. O delta de SERVIÇO do `ADDITIONAL_TIME` é **derivado**, nunca informado:
 *    minutos × taxa/hora congelada. Aceitar o valor do proponente abriria a
 *    porta para cobrar R$500 por "meia hora a mais" (§7.1).
 * 2. A taxa usada é a `trustFeeRateBps` do contrato, copiada para dentro desta
 *    linha. Mudar a Trust Fee da plataforma amanhã não pode mexer no que já foi
 *    aprovado hoje (§8).
 */
export class TrustChangeOrder {
  private constructor(private readonly props: TrustChangeOrderProps) {}

  static create(input: CreateChangeOrderInput): TrustChangeOrder {
    const { contract } = input;
    const reason = input.reason?.trim() ?? '';
    if (reason.length < 3) {
      throw new TrustChangeOrderValidationException('reason is required.');
    }
    if (
      !Number.isInteger(contract.trustFeeRateBps) ||
      contract.trustFeeRateBps < 0 ||
      contract.trustFeeRateBps > 10_000
    ) {
      throw new TrustChangeOrderValidationException(
        'trustFeeRateBps must be an integer between 0 and 10000.',
      );
    }

    const additionalMinutes = TrustChangeOrder.validateMinutes(input, contract);
    const serviceCents = TrustChangeOrder.resolveServiceDeltaCents(
      input,
      contract,
      additionalMinutes,
    );
    const materialCostCents = TrustChangeOrder.assertNonNegative(
      input.materialCostDeltaAmount ?? 0,
      'materialCostDelta',
    );
    const materialMarkupCents = TrustChangeOrder.assertNonNegative(
      input.materialMarkupDeltaAmount ?? 0,
      'materialMarkupDelta',
    );

    TrustChangeOrder.assertTypeShape(input.type, {
      serviceCents,
      materialCostCents,
      materialMarkupCents,
    });

    // §8: tudo em CENTAVOS. MATERIAL_COST é pass-through e fica FORA da base
    // da Trust Fee; SERVICE e MATERIAL_MARKUP entram.
    const grossCents = serviceCents + materialCostCents + materialMarkupCents;
    if (grossCents <= 0) {
      throw new TrustChangeOrderValidationException(
        'A change order must increase the authorized amount by more than zero.',
      );
    }
    const feeBaseCents = serviceCents + materialMarkupCents;
    const feeAmountCents = applyBasisPoints(feeBaseCents, contract.trustFeeRateBps);
    const providerNetCents = grossCents - feeAmountCents;

    const now = input.now ?? new Date();
    return new TrustChangeOrder({
      id: uuidv7(),
      orderId: input.orderId,
      proposedBy: input.proposedBy,
      type: input.type,
      status: CHANGE_ORDER_STATUS.DRAFT,
      currency: contract.currency,
      additionalMinutes,
      serviceDeltaAmount: toReais(serviceCents),
      materialCostDeltaAmount: toReais(materialCostCents),
      materialMarkupDeltaAmount: toReais(materialMarkupCents),
      trustFeeRateBps: contract.trustFeeRateBps,
      changeGrossAmount: toReais(grossCents),
      changeTrustFeeBaseAmount: toReais(feeBaseCents),
      changeTrustFeeAmount: toReais(feeAmountCents),
      changeProviderNetBeforePspFees: toReais(providerNetCents),
      reason,
      description: input.description?.trim() || null,
      expiresAt: input.expiresAt ?? null,
      submittedAt: null,
      decidedAt: null,
      decidedBy: null,
      decisionReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: TrustChangeOrderProps): TrustChangeOrder {
    return new TrustChangeOrder(props);
  }

  /** §7.1 — minutos só existem em ADDITIONAL_TIME, e só sobre contrato HOURLY. */
  private static validateMinutes(
    input: CreateChangeOrderInput,
    contract: FrozenContractTerms,
  ): number | null {
    if (input.type !== CHANGE_ORDER_TYPE.ADDITIONAL_TIME) {
      if (input.additionalMinutes) {
        throw new TrustChangeOrderValidationException(
          'additionalMinutes is only supported by ADDITIONAL_TIME change orders.',
        );
      }
      return null;
    }

    // §24: tempo adicional em FIXED_PRICE não existe — o caminho é SCOPE_CHANGE.
    if (contract.pricingModel !== PRICING_MODEL.HOURLY) {
      throw new TrustChangeOrderValidationException(
        'ADDITIONAL_TIME requires an HOURLY contract; use SCOPE_CHANGE for fixed-price work.',
      );
    }
    const minutes = input.additionalMinutes ?? 0;
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_ADDITIONAL_MINUTES) {
      throw new TrustChangeOrderValidationException(
        `additionalMinutes must be an integer between 1 and ${MAX_ADDITIONAL_MINUTES}.`,
      );
    }
    // §7.1: o incremento vem do CONTRATO congelado, nunca de uma leitura nova
    // da política global — mudar o padrão da plataforma não muda este contrato.
    const increment = contract.billingIncrementMinutes;
    if (!increment || increment <= 0) {
      throw new TrustChangeOrderValidationException(
        'The contract has no frozen billingIncrementMinutes; additional time cannot be priced.',
      );
    }
    if (minutes % increment !== 0) {
      throw new TrustChangeOrderValidationException(
        `additionalMinutes must be a multiple of the contract billing increment of ${increment} minutes.`,
      );
    }
    return minutes;
  }

  /** §7.1 — em ADDITIONAL_TIME o valor é DERIVADO; nos demais, informado. */
  private static resolveServiceDeltaCents(
    input: CreateChangeOrderInput,
    contract: FrozenContractTerms,
    additionalMinutes: number | null,
  ): number {
    if (input.type !== CHANGE_ORDER_TYPE.ADDITIONAL_TIME) {
      return TrustChangeOrder.assertNonNegative(input.serviceDeltaAmount ?? 0, 'serviceDelta');
    }
    if (input.serviceDeltaAmount !== undefined) {
      throw new TrustChangeOrderValidationException(
        'serviceDelta of an ADDITIONAL_TIME change order is derived from the frozen hourly rate.',
      );
    }
    if (!contract.hourlyRateAmount || contract.hourlyRateAmount <= 0) {
      throw new TrustChangeOrderValidationException(
        'The contract has no frozen hourlyRateAmount; additional time cannot be priced.',
      );
    }
    const hourlyRateCents = fromReais(contract.hourlyRateAmount);
    return Math.round((hourlyRateCents * (additionalMinutes ?? 0)) / 60);
  }

  private static assertNonNegative(amount: number, field: string): number {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new TrustChangeOrderValidationException(`${field} cannot be negative.`);
    }
    return fromReais(amount);
  }

  /** §7 — cada tipo carrega só os componentes que lhe pertencem. */
  private static assertTypeShape(
    type: ChangeOrderType,
    amounts: { serviceCents: number; materialCostCents: number; materialMarkupCents: number },
  ): void {
    const hasMaterial = amounts.materialCostCents > 0 || amounts.materialMarkupCents > 0;
    if (type === CHANGE_ORDER_TYPE.ADDITIONAL_TIME && hasMaterial) {
      throw new TrustChangeOrderValidationException(
        'ADDITIONAL_TIME cannot carry material amounts; use MIXED.',
      );
    }
    if (type === CHANGE_ORDER_TYPE.SCOPE_CHANGE && hasMaterial) {
      throw new TrustChangeOrderValidationException(
        'SCOPE_CHANGE cannot carry material amounts; use MIXED.',
      );
    }
    if (type === CHANGE_ORDER_TYPE.MATERIAL) {
      if (amounts.serviceCents > 0) {
        throw new TrustChangeOrderValidationException(
          'MATERIAL cannot carry a service amount; use MIXED.',
        );
      }
      if (!hasMaterial) {
        throw new TrustChangeOrderValidationException(
          'MATERIAL requires materialCostDelta and/or materialMarkupDelta.',
        );
      }
    }
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get proposedBy(): string {
    return this.props.proposedBy;
  }

  get type(): ChangeOrderType {
    return this.props.type;
  }

  get status(): ChangeOrderStatus {
    return this.props.status;
  }

  get currency(): string {
    return this.props.currency;
  }

  get additionalMinutes(): number | null {
    return this.props.additionalMinutes;
  }

  get serviceDeltaAmount(): number {
    return this.props.serviceDeltaAmount;
  }

  get materialCostDeltaAmount(): number {
    return this.props.materialCostDeltaAmount;
  }

  get materialMarkupDeltaAmount(): number {
    return this.props.materialMarkupDeltaAmount;
  }

  get trustFeeRateBps(): number {
    return this.props.trustFeeRateBps;
  }

  get changeGrossAmount(): number {
    return this.props.changeGrossAmount;
  }

  get changeTrustFeeBaseAmount(): number {
    return this.props.changeTrustFeeBaseAmount;
  }

  get changeTrustFeeAmount(): number {
    return this.props.changeTrustFeeAmount;
  }

  get changeProviderNetBeforePspFees(): number {
    return this.props.changeProviderNetBeforePspFees;
  }

  get reason(): string {
    return this.props.reason;
  }

  get description(): string | null {
    return this.props.description;
  }

  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }

  get submittedAt(): Date | null {
    return this.props.submittedAt;
  }

  get decidedAt(): Date | null {
    return this.props.decidedAt;
  }

  get decidedBy(): string | null {
    return this.props.decidedBy;
  }

  get decisionReason(): string | null {
    return this.props.decisionReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isApproved(): boolean {
    return this.props.status === CHANGE_ORDER_STATUS.APPROVED;
  }

  isPending(): boolean {
    return this.props.status === CHANGE_ORDER_STATUS.PENDING_MEMBER_APPROVAL;
  }

  /**
   * §6.1 — expiração DERIVADA da data, sem job de fundo (mesma decisão das
   * propostas, INCONSISTENCIAS #33). Só vale enquanto não houve decisão.
   */
  isExpiredAt(now = new Date()): boolean {
    if (this.props.status !== CHANGE_ORDER_STATUS.DRAFT && !this.isPending()) {
      return false;
    }
    return this.props.expiresAt !== null && this.props.expiresAt.getTime() <= now.getTime();
  }

  /**
   * Status para leitura: rascunho ou pendente já vencido é APRESENTADO como
   * EXPIRED, mesmo antes de alguém agir sobre ele — mesmo padrão de
   * `MarketplaceOffer.effectiveStatus()` (INCONSISTENCIAS #33).
   */
  effectiveStatus(now = new Date()): ChangeOrderStatus {
    return this.isExpiredAt(now) ? CHANGE_ORDER_STATUS.EXPIRED : this.props.status;
  }

  canTransitionTo(target: ChangeOrderStatus): boolean {
    return CHANGE_ORDER_TRANSITIONS[this.props.status].includes(target);
  }

  /** Porta única de mudança de estado — nenhum salto passa por aqui (§6.1). */
  private transitionTo(target: ChangeOrderStatus, now: Date): void {
    if (!this.canTransitionTo(target)) {
      throw new TrustChangeOrderTransitionException(this.props.status, target);
    }
    this.props.status = target;
    this.props.updatedAt = now;
  }

  /** §6.1 — sai do rascunho e vai para a mesa do Trust Member. */
  submit(now = new Date()): void {
    this.transitionTo(CHANGE_ORDER_STATUS.PENDING_MEMBER_APPROVAL, now);
    this.props.submittedAt = now;
  }

  /** §6.1 — aprovação explícita do Member: terminal e imutável. */
  approve(memberId: string, now = new Date()): void {
    this.transitionTo(CHANGE_ORDER_STATUS.APPROVED, now);
    this.props.decidedAt = now;
    this.props.decidedBy = memberId;
  }

  reject(memberId: string, reason?: string | null, now = new Date()): void {
    this.transitionTo(CHANGE_ORDER_STATUS.REJECTED, now);
    this.props.decidedAt = now;
    this.props.decidedBy = memberId;
    this.props.decisionReason = reason?.trim() || null;
  }

  /** §6.1 — só antes da decisão, e só por quem propôs. */
  cancel(actorId: string, now = new Date()): void {
    this.transitionTo(CHANGE_ORDER_STATUS.CANCELLED, now);
    this.props.decidedAt = now;
    this.props.decidedBy = actorId;
  }

  expire(now = new Date()): void {
    this.transitionTo(CHANGE_ORDER_STATUS.EXPIRED, now);
    this.props.decidedAt = now;
  }

  toProps(): TrustChangeOrderProps {
    return { ...this.props };
  }
}
