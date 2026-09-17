import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { LedgerAccount, LedgerEntry } from '../entities/ledger-entry';

export interface LedgerAccountBalance {
  account: LedgerAccount;
  balanceCents: number;
}

/**
 * IP-010 — persistência do ledger. `postGroup` é o único método de escrita:
 * grava TODAS as linhas de um fato (>= 2, balanceadas) numa única operação,
 * nunca uma linha isolada — a garantia de "todo grupo soma zero" vive tanto
 * no domínio (`assertBalanced`) quanto aqui.
 */
export abstract class LedgerRepository {
  /**
   * Insere o grupo de lançamentos. Idempotente por `(source_event_id, account,
   * direction)` (índice único) — chamado de novo com o MESMO evento não
   * duplica linha; devolve quantas linhas novas foram de fato inseridas.
   */
  abstract postGroup(entries: readonly LedgerEntry[], executor?: DatabaseExecutor): Promise<number>;

  abstract listByPayment(paymentId: string): Promise<LedgerEntry[]>;

  /** Saldo líquido (débito - crédito) de UM Payment numa conta específica. */
  abstract sumByPaymentAndAccount(paymentId: string, account: LedgerAccount): Promise<number>;

  /** Saldo agregado de toda a plataforma por conta — base dos relatórios financeiros. */
  abstract totalsByAccount(): Promise<LedgerAccountBalance[]>;
}
