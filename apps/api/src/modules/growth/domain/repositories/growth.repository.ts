import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { CashbackCampaign } from '../entities/cashback-campaign';
import { PointsEarningRule } from '../entities/points-earning-rule';
import { PointsLedgerEntry } from '../entities/points-ledger-entry';
import { ReferralAttribution, ReferralCode } from '../entities/referral';

export abstract class PointsLedgerRepository {
  /** Insere o lançamento; idempotente por `source_event_id` (índice único). Devolve `false` se já existia. */
  abstract append(entry: PointsLedgerEntry, executor?: DatabaseExecutor): Promise<boolean>;
  /** Saldo agregado (>= 0 por invariante de domínio, nunca materializado). */
  abstract balanceOf(identityId: string, executor?: DatabaseExecutor): Promise<number>;
  abstract listByIdentity(identityId: string): Promise<PointsLedgerEntry[]>;
  /**
   * Trava transacional (Postgres advisory lock, `pg_advisory_xact_lock`) sobre
   * a Identity — libera sozinha no COMMIT/ROLLBACK da transação. Fecha a
   * corrida "duas redenções concorrentes leem o mesmo saldo antes de
   * qualquer uma escrever" que `balanceOf` + `append` sozinhos não fecham
   * (o ledger é append-only, não há uma linha única para um `UPDATE ...
   * WHERE` estilo `closePauseIfOpen`/CAS). Deve ser chamada DENTRO da mesma
   * transação que lê o saldo e grava o REDEEM.
   */
  abstract lockIdentityForRedeem(identityId: string, executor: DatabaseExecutor): Promise<void>;
}

export abstract class PointsEarningRuleRepository {
  abstract save(rule: PointsEarningRule): Promise<void>;
  abstract findActiveByEventName(eventName: string, at: Date): Promise<PointsEarningRule[]>;
  abstract listAll(): Promise<PointsEarningRule[]>;
}

export abstract class ReferralRepository {
  abstract saveCode(code: ReferralCode): Promise<void>;
  abstract findCodeByIdentity(identityId: string): Promise<ReferralCode | null>;
  abstract findCodeByValue(code: string): Promise<ReferralCode | null>;
  abstract saveAttribution(attribution: ReferralAttribution, executor?: DatabaseExecutor): Promise<boolean>;
  abstract findAttributionByReferred(referredIdentityId: string): Promise<ReferralAttribution | null>;
  abstract updateAttribution(attribution: ReferralAttribution, executor?: DatabaseExecutor): Promise<void>;
  abstract countConfirmedByReferrer(referrerIdentityId: string): Promise<number>;
}

export abstract class CashbackCampaignRepository {
  abstract save(campaign: CashbackCampaign): Promise<void>;
  abstract findActiveAt(at: Date): Promise<CashbackCampaign[]>;
  abstract listAll(): Promise<CashbackCampaign[]>;
}
