import { fromReais, toReais } from '../../../../shared/money/money';
import { MarketplaceCommercialSnapshot } from '../entities/marketplace-commercial-snapshot';
import { TrustChangeOrder } from '../entities/trust-change-order';
import { CHANGE_ORDER_TYPE, PRICING_MODEL } from '../entities/marketplace-types';

/**
 * PACK-03 §5/§8 — total comercial CORRENTE do Trust Contract.
 *
 * `initial` é o snapshot imutável do PACK-02 e `approvedChanges` é a soma dos
 * Change Orders aprovados. Os dois campos existem separados de propósito: é
 * exatamente essa separação que o Trust Member vê no Service Summary
 * ("contratado + aprovado depois = total") e é ela que diz quanto está em
 * custódia hoje.
 */
export interface AuthorizedCommercialTotals {
  currency: string;
  initialGrossAmount: number;
  initialTrustFeeBaseAmount: number;
  initialTrustFeeAmount: number;
  initialProviderNetBeforePspFees: number;
  approvedChangesGrossAmount: number;
  approvedChangesTrustFeeBaseAmount: number;
  approvedChangesTrustFeeAmount: number;
  approvedChangesProviderNetBeforePspFees: number;
  currentGrossAmount: number;
  currentServiceAmount: number;
  currentMaterialCostAmount: number;
  currentMaterialMarkupAmount: number;
  currentTrustFeeBaseAmount: number;
  currentTrustFeeAmount: number;
  currentProviderNetBeforePspFees: number;
  /**
   * PACK-03 §9 — recorte do pagamento. O `Payment`/`TrustCustody` do PACK-01
   * congela o valor INICIAL na contratação e não admite autorização
   * incremental; portanto o delta aprovado é comercialmente autorizado, mas
   * NÃO está em custódia. Ver o item parado do §9 no completion report.
   */
  amountInCustody: number;
  amountAuthorizedNotInCustody: number;
}

/**
 * Tempo comercialmente autorizado (§11/§12). `null` em contrato FIXED_PRICE:
 * ali o tempo é registro operacional, não moeda.
 */
export interface AuthorizedTime {
  initialAuthorizedMinutes: number | null;
  approvedAdditionalMinutes: number;
  authorizedMinutes: number | null;
}

/** Soma os deltas aprovados sobre o snapshot inicial — nada é recalculado. */
export function calculateAuthorizedTotals(
  snapshot: MarketplaceCommercialSnapshot,
  changeOrders: TrustChangeOrder[],
): AuthorizedCommercialTotals {
  const approved = changeOrders.filter((changeOrder) => changeOrder.isApproved());

  // Cálculo em CENTAVOS (trust-payments §1): somar reais em ponto flutuante
  // acumularia erro de centavo justamente na conta que o cliente confere.
  let changeGross = 0;
  let changeFeeBase = 0;
  let changeFee = 0;
  let changeNet = 0;
  let changeService = 0;
  let changeMaterialCost = 0;
  let changeMaterialMarkup = 0;

  for (const changeOrder of approved) {
    changeGross += fromReais(changeOrder.changeGrossAmount);
    changeFeeBase += fromReais(changeOrder.changeTrustFeeBaseAmount);
    changeFee += fromReais(changeOrder.changeTrustFeeAmount);
    changeNet += fromReais(changeOrder.changeProviderNetBeforePspFees);
    changeService += fromReais(changeOrder.serviceDeltaAmount);
    changeMaterialCost += fromReais(changeOrder.materialCostDeltaAmount);
    changeMaterialMarkup += fromReais(changeOrder.materialMarkupDeltaAmount);
  }

  const initialGross = fromReais(snapshot.grossAmount);
  const initialFeeBase = fromReais(snapshot.trustFeeBaseAmount);
  const initialFee = fromReais(snapshot.trustFeeAmount);
  const initialNet = fromReais(snapshot.providerNetBeforePspFees);

  return {
    currency: snapshot.currency,
    initialGrossAmount: toReais(initialGross),
    initialTrustFeeBaseAmount: toReais(initialFeeBase),
    initialTrustFeeAmount: toReais(initialFee),
    initialProviderNetBeforePspFees: toReais(initialNet),
    approvedChangesGrossAmount: toReais(changeGross),
    approvedChangesTrustFeeBaseAmount: toReais(changeFeeBase),
    approvedChangesTrustFeeAmount: toReais(changeFee),
    approvedChangesProviderNetBeforePspFees: toReais(changeNet),
    currentGrossAmount: toReais(initialGross + changeGross),
    currentServiceAmount: toReais(fromReais(snapshot.serviceAmount) + changeService),
    currentMaterialCostAmount: toReais(
      fromReais(snapshot.materialCostAmount) + changeMaterialCost,
    ),
    currentMaterialMarkupAmount: toReais(
      fromReais(snapshot.materialMarkupAmount) + changeMaterialMarkup,
    ),
    currentTrustFeeBaseAmount: toReais(initialFeeBase + changeFeeBase),
    currentTrustFeeAmount: toReais(initialFee + changeFee),
    currentProviderNetBeforePspFees: toReais(initialNet + changeNet),
    // §9: a custódia do PACK-01 segura o valor inicial e nada mais.
    amountInCustody: toReais(initialGross),
    amountAuthorizedNotInCustody: toReais(changeGross),
  };
}

/** §12 — tempo autorizado = mínimo contratado + ADDITIONAL_TIME aprovados. */
export function calculateAuthorizedTime(
  snapshot: MarketplaceCommercialSnapshot,
  changeOrders: TrustChangeOrder[],
): AuthorizedTime {
  const approvedAdditionalMinutes = changeOrders
    .filter(
      (changeOrder) =>
        changeOrder.isApproved() && changeOrder.type === CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
    )
    .reduce((total, changeOrder) => total + (changeOrder.additionalMinutes ?? 0), 0);

  if (snapshot.pricingModel !== PRICING_MODEL.HOURLY) {
    return {
      initialAuthorizedMinutes: null,
      approvedAdditionalMinutes,
      authorizedMinutes: null,
    };
  }

  const initialAuthorizedMinutes = snapshot.minimumMinutes ?? 0;
  return {
    initialAuthorizedMinutes,
    approvedAdditionalMinutes,
    authorizedMinutes: initialAuthorizedMinutes + approvedAdditionalMinutes,
  };
}

/**
 * PACK-03 §11 — **presença não é automaticamente tempo faturável**.
 *
 * O faturável é o tempo ativo preso entre dois limites:
 *
 * - **teto**: o autorizado (mínimo contratado + Change Orders aprovados). Passar
 *   disso viraria cobrança unilateral, que é o que o Pack existe para impedir;
 * - **piso**: o mínimo contratado. O Member já pagou por ele na contratação, e
 *   devolução de valor é reembolso — explicitamente fora do escopo (§4.2).
 *
 * Em FIXED_PRICE devolve `null`: ali tempo não vira dinheiro.
 */
export function calculateBillableMinutes(input: {
  rawActiveMinutes: number | null;
  authorizedMinutes: number | null;
  minimumMinutes: number | null;
}): number | null {
  if (input.authorizedMinutes === null || input.rawActiveMinutes === null) {
    return null;
  }
  const floor = Math.min(input.minimumMinutes ?? 0, input.authorizedMinutes);
  return Math.min(Math.max(input.rawActiveMinutes, floor), input.authorizedMinutes);
}
