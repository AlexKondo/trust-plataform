import { Cents } from '../../../../shared/money/money';
import { IncrementalTrustCustody } from '../entities/incremental-trust-custody';
import { Payment } from '../entities/payment';
import { PaymentIncrementalAuthorization } from '../entities/payment-incremental-authorization';
import { CustodyStatus, TrustCustody } from '../entities/trust-custody';

/**
 * IP-007 — o resumo de custódia que o mandato desta IP pede explicitamente:
 * "a qualquer momento tem que ser possível consultar/derivar (a) total
 * comercialmente autorizado, (b) total efetivamente em custódia através de
 * todas as tranches, e (c) o delta entre os dois — isso tem que ser um valor
 * QUERYABLE/COMPUTÁVEL, não algo que um desenvolvedor tem que engenheirar de
 * volta."
 *
 * Função PURA de propósito (mesmo motivo de `evaluateRelease`/
 * `authorized-commercial.service.ts`): o resultado tem que ser reproduzível a
 * partir do estado, sem I/O aqui dentro — quem busca os dados é o use case.
 */
export interface IncrementalTrancheSummary {
  changeOrderId: string;
  incrementalAuthorizationId: string;
  amountCents: Cents;
  authorizationStatus: string;
  custodyStatus: CustodyStatus | null;
}

export interface PaymentCustodySummary {
  currency: string;
  /** O valor original do Payment (imutável desde a criação). */
  originalAmountCents: Cents;
  originalCustodyStatus: CustodyStatus | null;
  /** originalAmountCents + Σ changeGrossAmount de Change Orders APROVADOS. */
  totalCommerciallyAuthorizedCents: Cents;
  /** Σ dos valores de TODAS as tranches que efetivamente entraram em custódia
   * (original, se existe + toda tranche incremental com autorização aprovada
   * — independente do status atual da tranche, porque RELEASED ainda
   * significa "foi custodiado", só que já saiu para o prestador). */
  totalHeldCents: Cents;
  /** (a) - (b), nunca negativo por construção (ver nota abaixo). */
  amountAuthorizedNotInCustodyCents: Cents;
  incrementalTranches: IncrementalTrancheSummary[];
}

export function calculatePaymentCustodySummary(input: {
  payment: Payment;
  originalCustody: TrustCustody | null;
  approvedChangeGrossCents: Cents;
  incrementalAuthorizations: PaymentIncrementalAuthorization[];
  incrementalCustodies: IncrementalTrustCustody[];
}): PaymentCustodySummary {
  const { payment, originalCustody, approvedChangeGrossCents, incrementalAuthorizations, incrementalCustodies } =
    input;

  const custodyByChangeOrder = new Map(
    incrementalCustodies.map((tranche) => [tranche.changeOrderId, tranche]),
  );

  const incrementalTranches: IncrementalTrancheSummary[] = incrementalAuthorizations.map(
    (authorization) => {
      const tranche = custodyByChangeOrder.get(authorization.changeOrderId) ?? null;
      return {
        changeOrderId: authorization.changeOrderId,
        incrementalAuthorizationId: authorization.id,
        amountCents: authorization.amountCents,
        authorizationStatus: authorization.status,
        custodyStatus: tranche?.status ?? null,
      };
    },
  );

  const heldIncrementalCents = incrementalCustodies.reduce(
    (sum, tranche) => sum + tranche.amountCents,
    0,
  );
  const heldOriginalCents = originalCustody ? originalCustody.amountCents : 0;
  const totalHeldCents = heldOriginalCents + heldIncrementalCents;

  const totalCommerciallyAuthorizedCents = payment.amountCents + approvedChangeGrossCents;

  return {
    currency: payment.currency,
    originalAmountCents: payment.amountCents,
    originalCustodyStatus: originalCustody?.status ?? null,
    totalCommerciallyAuthorizedCents,
    totalHeldCents,
    // Nunca negativo por construção: toda tranche incremental EM custódia
    // corresponde a um Change Order aprovado somado em
    // `approvedChangeGrossCents`, e o valor original só entra em
    // `totalHeldCents` depois de também estar contado em `payment.amountCents`
    // — mas usamos Math.max por segurança defensiva (não confiar cegamente em
    // dois cálculos concordarem é a mesma disciplina de `snapshotMatches`).
    amountAuthorizedNotInCustodyCents: Math.max(
      0,
      totalCommerciallyAuthorizedCents - totalHeldCents,
    ),
    incrementalTranches,
  };
}
