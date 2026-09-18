import { v7 as uuidv7 } from 'uuid';
import { Cents, assertCents } from '../../../../shared/money/money';
import { LedgerValidationException } from '../exceptions/payment.exceptions';

/**
 * IP-010 — dimensão fechada de contas do ledger. Derivada dos fatos que o
 * domínio JÁ distingue (PACK-01 custódia, IP-007 tranches, IP-008 reembolso):
 * não é uma taxonomia contábil nova, é o espelho do que existe.
 *
 * - MEMBER_FUNDING_CLEARING: dinheiro do comprador em trânsito para dentro/fora
 *   da custódia da plataforma (contrapartida de CUSTODY_HELD e de reembolso).
 * - CUSTODY_HELD: valor efetivamente retido pela Trust em nome do pedido.
 * - PARTNER_PAYABLE: valor liberado da custódia, devido/pago ao prestador.
 * - REFUND_ISSUED: valor devolvido ao comprador (fato histórico, nunca some).
 *
 * TRUST_FEE_EARNED / PSP_FEE / DISTRIBUTION ficam definidos aqui como extensão
 * pronta (ver IP-010-COMPLETION-REPORT §Lacunas): nenhum evento de domínio
 * hoje isola esses valores como fato PAGO/COBRADO (apenas como campos
 * comerciais de cotação/Change Order), então nenhum consumer posta neles
 * ainda — postar um número inventado violaria Shared Standards §5.
 */
export const LEDGER_ACCOUNTS = {
  MEMBER_FUNDING_CLEARING: 'MEMBER_FUNDING_CLEARING',
  CUSTODY_HELD: 'CUSTODY_HELD',
  PARTNER_PAYABLE: 'PARTNER_PAYABLE',
  REFUND_ISSUED: 'REFUND_ISSUED',
  TRUST_FEE_EARNED: 'TRUST_FEE_EARNED',
  PSP_FEE: 'PSP_FEE',
  /**
   * IP-012 — Cashback (Growth). Passivo da plataforma perante o Member
   * quando uma campanha de cashback admin-configurada (`cashback_campaigns`,
   * módulo `growth`) está ativa para o fato de origem. `CASHBACK_LIABILITY`
   * nasce no momento do fato (ex.: pagamento liquidado); `CASHBACK_PAYABLE`
   * é a contrapartida — o desembolso real depende de IP-009 (BLOCKED_EXTERNAL),
   * então hoje esta conta só acumula passivo contábil, nunca é baixada por
   * um pagamento real (ver IP-012-COMPLETION-REPORT.md).
   */
  CASHBACK_LIABILITY: 'CASHBACK_LIABILITY',
  CASHBACK_PAYABLE: 'CASHBACK_PAYABLE',
} as const;

export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[keyof typeof LEDGER_ACCOUNTS];

export const LEDGER_DIRECTIONS = { DEBIT: 'DEBIT', CREDIT: 'CREDIT' } as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[keyof typeof LEDGER_DIRECTIONS];

export interface LedgerEntryProps {
  id: string;
  sourceEventId: string;
  sourceEventType: string;
  sourceAggregateType: string;
  sourceAggregateId: string;
  paymentId: string;
  account: LedgerAccount;
  direction: LedgerDirection;
  amountCents: Cents;
  currency: string;
  postingGroupId: string;
  createdAt: Date;
}

/**
 * Uma linha IMUTÁVEL do ledger. Nasce pronta (sem `transitionTo`, sem
 * setters) porque um lançamento contábil não muda depois de existir — um
 * erro é corrigido por uma linha NOVA que o contrabalança, nunca por edição
 * (Shared Standards §5 "financial snapshots/history immutable").
 */
export class LedgerEntry {
  private constructor(private readonly props: LedgerEntryProps) {}

  static create(input: {
    sourceEventId: string;
    sourceEventType: string;
    sourceAggregateType: string;
    sourceAggregateId: string;
    paymentId: string;
    account: LedgerAccount;
    direction: LedgerDirection;
    amountCents: Cents;
    currency: string;
    postingGroupId: string;
    now?: Date;
  }): LedgerEntry {
    assertCents(input.amountCents, 'ledger entry amountCents');
    if (input.amountCents === 0) {
      throw new LedgerValidationException('Ledger entry amount must be greater than zero.');
    }
    return new LedgerEntry({
      id: uuidv7(),
      sourceEventId: input.sourceEventId,
      sourceEventType: input.sourceEventType,
      sourceAggregateType: input.sourceAggregateType,
      sourceAggregateId: input.sourceAggregateId,
      paymentId: input.paymentId,
      account: input.account,
      direction: input.direction,
      amountCents: input.amountCents,
      currency: input.currency,
      postingGroupId: input.postingGroupId,
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(props: LedgerEntryProps): LedgerEntry {
    return new LedgerEntry(props);
  }

  get id(): string {
    return this.props.id;
  }
  get sourceEventId(): string {
    return this.props.sourceEventId;
  }
  get paymentId(): string {
    return this.props.paymentId;
  }
  get account(): LedgerAccount {
    return this.props.account;
  }
  get direction(): LedgerDirection {
    return this.props.direction;
  }
  get amountCents(): Cents {
    return this.props.amountCents;
  }
  get currency(): string {
    return this.props.currency;
  }
  get postingGroupId(): string {
    return this.props.postingGroupId;
  }
  get sourceAggregateType(): string {
    return this.props.sourceAggregateType;
  }
  get sourceAggregateId(): string {
    return this.props.sourceAggregateId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Sinal contábil: DEBIT positivo, CREDIT negativo — soma de um grupo balanceado é sempre 0. */
  signedAmountCents(): Cents {
    return this.props.direction === LEDGER_DIRECTIONS.DEBIT
      ? this.props.amountCents
      : -this.props.amountCents;
  }

  toProps(): LedgerEntryProps {
    return { ...this.props };
  }
}

/**
 * Um FATO financeiro = duas (ou mais) linhas que compartilham `postingGroupId`
 * e cuja soma assinada é ZERO (débitos == créditos). `buildBalancedPosting`
 * é o único ponto de construção usado pelos consumers — nenhum consumer monta
 * `LedgerEntry` manualmente, evitando um posting desbalanceado por engano.
 */
export function buildBalancedPosting(input: {
  sourceEventId: string;
  sourceEventType: string;
  sourceAggregateType: string;
  sourceAggregateId: string;
  paymentId: string;
  amountCents: Cents;
  currency: string;
  debitAccount: LedgerAccount;
  creditAccount: LedgerAccount;
  now?: Date;
}): [LedgerEntry, LedgerEntry] {
  const postingGroupId = uuidv7();
  const base = {
    sourceEventId: input.sourceEventId,
    sourceEventType: input.sourceEventType,
    sourceAggregateType: input.sourceAggregateType,
    sourceAggregateId: input.sourceAggregateId,
    paymentId: input.paymentId,
    amountCents: input.amountCents,
    currency: input.currency,
    postingGroupId,
    now: input.now,
  };
  const debit = LedgerEntry.create({
    ...base,
    account: input.debitAccount,
    direction: LEDGER_DIRECTIONS.DEBIT,
  });
  const credit = LedgerEntry.create({
    ...base,
    account: input.creditAccount,
    direction: LEDGER_DIRECTIONS.CREDIT,
  });
  return [debit, credit];
}

/** Invariante central (acceptance criteria "ledger entries balance"). */
export function assertBalanced(entries: readonly LedgerEntry[]): void {
  const sum = entries.reduce((total, entry) => total + entry.signedAmountCents(), 0);
  if (sum !== 0) {
    throw new LedgerValidationException(
      `Unbalanced ledger posting: signed sum is ${sum}, expected 0.`,
    );
  }
}
