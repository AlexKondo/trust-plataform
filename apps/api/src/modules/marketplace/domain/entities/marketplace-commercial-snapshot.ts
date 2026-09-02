import { v7 as uuidv7 } from 'uuid';
import { applyBasisPoints, fromReais, toReais } from '../../../../shared/money/money';
import { MarketplaceCommercialSnapshotValidationException } from '../exceptions/marketplace.exceptions';
import { PricingModel } from './marketplace-types';

export interface CommercialSnapshotProps {
  id: string;
  orderId: string;
  pricingModel: PricingModel;
  currency: string;
  /** SERVICE + MATERIAL_COST + MATERIAL_MARKUP (reais). */
  grossAmount: number;
  serviceAmount: number;
  /** Pass-through, 0% Trust Fee no MVP (§5/§8) — sempre 0 até material entrar em escopo. */
  materialCostAmount: number;
  /** Fee-eligible (§5) — sempre 0 no MVP: PACK-02 não captura markup ainda. */
  materialMarkupAmount: number;
  /** Taxa efetiva CONGELADA no momento do contrato (§7). */
  trustFeeRateBps: number;
  /** SERVICE + MATERIAL_MARKUP (MATERIAL_COST fica de fora — §8). */
  trustFeeBaseAmount: number;
  trustFeeAmount: number;
  /** grossAmount - trustFeeAmount; taxas de PSP intencionalmente excluídas (§7/§8). */
  providerNetBeforePspFees: number;
  hourlyRateAmount: number | null;
  minimumMinutes: number | null;
  billingIncrementMinutes: number | null;
  createdAt: Date;
}

/**
 * PACK-02 §7/§8/§12 — snapshot econômico imutável do Trust Contract.
 *
 * Nasce UMA vez, no aceite da proposta (`AcceptOfferUseCase`), e nunca é
 * recalculado: `restore()` só reidrata o que já foi persistido. Mudanças
 * futuras na `CommercialPolicy` (Trust Fee, incremento padrão) NUNCA afetam um
 * snapshot já criado — cada linha desta entidade é o registro congelado de uma
 * transação específica (§7 "Changing the platform's default Trust Fee ... must
 * not retroactively change an existing ... snapshot").
 *
 * §12 prepara — sem implementar — a extensão futura: este é o
 * `initialContractSnapshot` imutável sobre o qual o PACK-03 vai somar
 * `approvedChangeOrders[]` para chegar ao `currentAuthorizedCommercialAmount`.
 * Nenhum campo de Change Order existe aqui ainda.
 */
export class MarketplaceCommercialSnapshot {
  private constructor(private readonly props: CommercialSnapshotProps) {}

  static create(input: {
    orderId: string;
    pricingModel: PricingModel;
    currency: string;
    serviceAmount: number;
    materialCostAmount?: number;
    materialMarkupAmount?: number;
    trustFeeRateBps: number;
    hourlyRateAmount?: number | null;
    minimumMinutes?: number | null;
    billingIncrementMinutes?: number | null;
    now?: Date;
  }): MarketplaceCommercialSnapshot {
    const materialCostAmount = input.materialCostAmount ?? 0;
    const materialMarkupAmount = input.materialMarkupAmount ?? 0;

    if (!(input.serviceAmount > 0)) {
      throw new MarketplaceCommercialSnapshotValidationException(
        'serviceAmount must be greater than zero.',
      );
    }
    if (materialCostAmount < 0) {
      throw new MarketplaceCommercialSnapshotValidationException(
        'materialCostAmount cannot be negative.',
      );
    }
    if (materialMarkupAmount < 0) {
      throw new MarketplaceCommercialSnapshotValidationException(
        'materialMarkupAmount cannot be negative.',
      );
    }
    if (
      !Number.isInteger(input.trustFeeRateBps) ||
      input.trustFeeRateBps < 0 ||
      input.trustFeeRateBps > 10_000
    ) {
      throw new MarketplaceCommercialSnapshotValidationException(
        'trustFeeRateBps must be an integer between 0 and 10000.',
      );
    }

    // §8: cálculo inteiramente em CENTAVOS (trust-payments §1) — soma em
    // reais acumularia erro de ponto flutuante na conciliação (PAY-010).
    const serviceCents = fromReais(input.serviceAmount);
    const materialCostCents = fromReais(materialCostAmount);
    const materialMarkupCents = fromReais(materialMarkupAmount);
    const grossCents = serviceCents + materialCostCents + materialMarkupCents;

    // §8: MATERIAL_COST é pass-through — fica FORA da base do Trust Fee.
    const feeBaseCents = serviceCents + materialMarkupCents;
    const feeAmountCents = applyBasisPoints(feeBaseCents, input.trustFeeRateBps);
    const providerNetCents = grossCents - feeAmountCents;

    // Defensivo: se algum dia isso deixar de valer, é bug interno de cálculo,
    // não uma condição de negócio esperada (§15 "snapshot totals inconsistent").
    if (feeAmountCents > feeBaseCents || feeBaseCents > grossCents || providerNetCents < 0) {
      throw new MarketplaceCommercialSnapshotValidationException(
        'Inconsistent commercial snapshot totals.',
      );
    }

    const now = input.now ?? new Date();
    return new MarketplaceCommercialSnapshot({
      id: uuidv7(),
      orderId: input.orderId,
      pricingModel: input.pricingModel,
      currency: input.currency,
      grossAmount: toReais(grossCents),
      serviceAmount: input.serviceAmount,
      materialCostAmount,
      materialMarkupAmount,
      trustFeeRateBps: input.trustFeeRateBps,
      trustFeeBaseAmount: toReais(feeBaseCents),
      trustFeeAmount: toReais(feeAmountCents),
      providerNetBeforePspFees: toReais(providerNetCents),
      hourlyRateAmount: input.hourlyRateAmount ?? null,
      minimumMinutes: input.minimumMinutes ?? null,
      billingIncrementMinutes: input.billingIncrementMinutes ?? null,
      createdAt: now,
    });
  }

  static restore(props: CommercialSnapshotProps): MarketplaceCommercialSnapshot {
    return new MarketplaceCommercialSnapshot(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get pricingModel(): PricingModel {
    return this.props.pricingModel;
  }

  get currency(): string {
    return this.props.currency;
  }

  get grossAmount(): number {
    return this.props.grossAmount;
  }

  get serviceAmount(): number {
    return this.props.serviceAmount;
  }

  get materialCostAmount(): number {
    return this.props.materialCostAmount;
  }

  get materialMarkupAmount(): number {
    return this.props.materialMarkupAmount;
  }

  get trustFeeRateBps(): number {
    return this.props.trustFeeRateBps;
  }

  get trustFeeBaseAmount(): number {
    return this.props.trustFeeBaseAmount;
  }

  get trustFeeAmount(): number {
    return this.props.trustFeeAmount;
  }

  get providerNetBeforePspFees(): number {
    return this.props.providerNetBeforePspFees;
  }

  get hourlyRateAmount(): number | null {
    return this.props.hourlyRateAmount;
  }

  get minimumMinutes(): number | null {
    return this.props.minimumMinutes;
  }

  get billingIncrementMinutes(): number | null {
    return this.props.billingIncrementMinutes;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toProps(): CommercialSnapshotProps {
    return { ...this.props };
  }
}
