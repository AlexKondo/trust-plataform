export interface CommercialPolicyProps {
  id: string;
  trustFeeRateBps: number;
  defaultBillingIncrementMinutes: number;
  createdAt: Date;
}

/**
 * PACK-02 §6 — política comercial vigente: Trust Fee (basis points) e
 * incremento padrão de cobrança HOURLY. Não é aggregate root com transições —
 * é um read-model simples, restaurado a partir da linha mais recente da
 * tabela `commercial_policies` (que é append-only por design; ver
 * `commercial-policy.schema.ts`).
 */
export class CommercialPolicy {
  private constructor(private readonly props: CommercialPolicyProps) {}

  static restore(props: CommercialPolicyProps): CommercialPolicy {
    return new CommercialPolicy(props);
  }

  get id(): string {
    return this.props.id;
  }

  get trustFeeRateBps(): number {
    return this.props.trustFeeRateBps;
  }

  get defaultBillingIncrementMinutes(): number {
    return this.props.defaultBillingIncrementMinutes;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
