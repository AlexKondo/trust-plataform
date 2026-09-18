import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { PointsLedgerEntry } from '../../domain/entities/points-ledger-entry';
import { InsufficientPointsBalanceException } from '../../domain/exceptions/growth.exceptions';
import { PointsEarningRuleRepository, PointsLedgerRepository } from '../../domain/repositories/growth.repository';

export interface AccruePointsFromRuleInput {
  identityId: string;
  eventName: string;
  sourceEventId: string;
  now?: Date;
}

/**
 * IP-012 — acúmulo de pontos disparado por um evento de domínio já existente
 * (ex.: `ServiceRequest.Completed`). Só posta se houver uma
 * `PointsEarningRule` ATIVA e dentro da janela para `eventName` no momento
 * — se nenhum admin configurou nada (padrão do Release 1.0), este use case
 * é NO-OP por design, nunca inventa um valor. Idempotente por
 * `sourceEventId` (índice único em `points_ledger`).
 */
@Injectable()
export class AccruePointsFromRuleUseCase {
  constructor(
    private readonly rules: PointsEarningRuleRepository,
    private readonly ledger: PointsLedgerRepository,
  ) {}

  async execute(input: AccruePointsFromRuleInput): Promise<{ accrued: boolean; points: number }> {
    const now = input.now ?? new Date();
    const [rule] = await this.rules.findActiveByEventName(input.eventName, now);
    if (!rule) {
      return { accrued: false, points: 0 };
    }
    const entry = PointsLedgerEntry.create({
      identityId: input.identityId,
      direction: 'EARN',
      points: rule.points,
      reason: input.eventName,
      sourceEventId: input.sourceEventId,
      ruleId: rule.id,
      now,
    });
    const inserted = await this.ledger.append(entry);
    return { accrued: inserted, points: rule.points };
  }
}

export interface RedeemPointsInput {
  identityId: string;
  points: number;
  reason: string;
  sourceEventId: string;
  now?: Date;
}

/**
 * Resgate manual/administrativo. NÃO existe catálogo de resgate decidido
 * (ver Conflict Escalation TRUST-POINTS-ACCRUAL) — este use case só garante
 * a invariante "saldo nunca negativo" e idempotência; o QUE se resgata
 * (produto/desconto) fica fora de escopo até haver decisão.
 *
 * Concorrência (Quality Gate finding #2): o ledger é append-only — não existe
 * UMA linha de saldo para um `UPDATE ... WHERE` estilo `closePauseIfOpen`
 * (CAS). Em vez disso, toda a operação (ler saldo, decidir, gravar REDEEM)
 * roda dentro de UMA transação protegida por `pg_advisory_xact_lock` na
 * Identity (`lockIdentityForRedeem`) — duas chamadas concorrentes para a
 * MESMA identidade serializam nessa trava; a segunda só lê o saldo depois
 * que a primeira já commitou (ou não), nunca as duas leem o mesmo saldo
 * "velho" ao mesmo tempo. Não exploitável hoje (nenhum catálogo/endpoint de
 * resgate está exposto a Members ainda), mas correto por construção antes
 * que um exista.
 */
@Injectable()
export class RedeemPointsUseCase {
  constructor(
    private readonly ledger: PointsLedgerRepository,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async execute(input: RedeemPointsInput): Promise<{ redeemed: boolean; balance: number }> {
    const now = input.now ?? new Date();
    return this.db.transaction(async (tx) => {
      await this.ledger.lockIdentityForRedeem(input.identityId, tx);
      const balance = await this.ledger.balanceOf(input.identityId, tx);
      if (balance < input.points) {
        throw new InsufficientPointsBalanceException(
          `identity ${input.identityId} has ${balance} points, cannot redeem ${input.points}.`,
        );
      }
      const entry = PointsLedgerEntry.create({
        identityId: input.identityId,
        direction: 'REDEEM',
        points: input.points,
        reason: input.reason,
        sourceEventId: input.sourceEventId,
        now,
      });
      const inserted = await this.ledger.append(entry, tx);
      const finalBalance = inserted ? balance - input.points : balance;
      return { redeemed: inserted, balance: finalBalance };
    });
  }
}

@Injectable()
export class GetPointsBalanceUseCase {
  constructor(private readonly ledger: PointsLedgerRepository) {}

  async execute(identityId: string): Promise<{ balance: number }> {
    const balance = await this.ledger.balanceOf(identityId);
    return { balance };
  }
}
