/**
 * Aritmética monetária da plataforma (skill trust-payments §1).
 *
 * REGRA: todo cálculo acontece em CENTAVOS INTEIROS. Ponto flutuante em reais
 * perde centavo no rateio (`0.1 + 0.2 !== 0.3`) e a conciliação financeira
 * (PAY-010) acusa isso como divergência CRÍTICA. Reais só existem na fronteira:
 * banco (`numeric(18,2)`) e API.
 */

/** Valor em centavos — sempre inteiro, nunca negativo em agregados de valor. */
export type Cents = number;

export class MoneyError extends Error {}

export function assertCents(value: number, field = 'amount'): Cents {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${field} must be an integer number of cents (got ${value}).`);
  }
  if (value < 0) {
    throw new MoneyError(`${field} cannot be negative.`);
  }
  return value;
}

/** Reais (banco/API) → centavos. Arredonda para o centavo mais próximo. */
export function fromReais(value: number | string): Cents {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) {
    throw new MoneyError(`Invalid monetary value: ${String(value)}`);
  }
  return Math.round(parsed * 100);
}

/** Centavos → string em reais com 2 casas, para gravar em `numeric(18,2)`. */
export function toReaisString(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

/** Centavos → number em reais, para a resposta da API. */
export function toReais(cents: Cents): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Percentual em **basis points** (1 bp = 0,01%; 1000 bp = 10%).
 * Inteiros evitam a imprecisão de guardar 0.1 como taxa.
 */
export type BasisPoints = number;

export function applyBasisPoints(cents: Cents, basisPoints: BasisPoints): Cents {
  assertCents(cents);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new MoneyError(`basisPoints must be an integer between 0 and 10000 (got ${basisPoints}).`);
  }
  return Math.round((cents * basisPoints) / 10_000);
}

export interface SplitShare {
  /** Identificador livre do beneficiário (identityId, 'PLATFORM'...). */
  key: string;
  basisPoints: BasisPoints;
}

export interface SplitResult {
  key: string;
  amountCents: Cents;
  basisPoints: BasisPoints;
}

/**
 * Rateia um total entre beneficiários garantindo que a soma seja EXATAMENTE o
 * total (PAY-007 BR-005). O resto da divisão vai para o último da lista — por
 * isso a ordem importa: coloque o prestador por último, para que a sobra fique
 * com quem prestou o serviço, e não com a plataforma.
 */
export function splitAmount(totalCents: Cents, shares: SplitShare[]): SplitResult[] {
  assertCents(totalCents, 'totalCents');
  if (shares.length === 0) {
    throw new MoneyError('splitAmount requires at least one share.');
  }
  const totalBasisPoints = shares.reduce((sum, share) => sum + share.basisPoints, 0);
  if (totalBasisPoints !== 10_000) {
    throw new MoneyError(`Shares must sum to 10000 basis points (got ${totalBasisPoints}).`);
  }

  const results: SplitResult[] = [];
  let distributed = 0;

  shares.forEach((share, index) => {
    const isLast = index === shares.length - 1;
    // O último recebe a sobra: garante soma exata mesmo com arredondamentos.
    const amountCents = isLast
      ? totalCents - distributed
      : applyBasisPoints(totalCents, share.basisPoints);
    distributed += amountCents;
    results.push({ key: share.key, amountCents, basisPoints: share.basisPoints });
  });

  return results;
}

/** Soma defensiva — recusa entrada não inteira em vez de propagar erro silencioso. */
export function sumCents(values: Cents[]): Cents {
  return values.reduce<Cents>((sum, value) => sum + assertCents(value), 0);
}

/** Formata para logs e textos de notificação. */
export function formatCents(cents: Cents, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}
