import { Injectable } from '@nestjs/common';
import { CashbackCampaign } from '../../domain/entities/cashback-campaign';
import { PointsEarningRule } from '../../domain/entities/points-earning-rule';
import { CashbackCampaignRepository, PointsEarningRuleRepository } from '../../domain/repositories/growth.repository';

export interface ConfigurePointsRuleInput {
  eventName: string;
  description: string;
  points: number;
  active?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

/**
 * ADMIN-only (route guarded by RBAC at controller level, same convention as
 * `trust-score-admin.controller.ts`). Cria/edita uma regra de acúmulo de
 * pontos. `active` default `false` na tabela — um admin precisa
 * explicitamente ligar a regra, nunca "on by accident".
 */
@Injectable()
export class ConfigurePointsRuleUseCase {
  constructor(private readonly rules: PointsEarningRuleRepository) {}

  async execute(input: ConfigurePointsRuleInput): Promise<{ id: string }> {
    const rule = PointsEarningRule.create(input);
    await this.rules.save(rule);
    return { id: rule.id };
  }
}

export interface ConfigureCashbackCampaignInput {
  name: string;
  percentageBps: number;
  active?: boolean;
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class ConfigureCashbackCampaignUseCase {
  constructor(private readonly campaigns: CashbackCampaignRepository) {}

  async execute(input: ConfigureCashbackCampaignInput): Promise<{ id: string }> {
    const campaign = CashbackCampaign.create(input);
    await this.campaigns.save(campaign);
    return { id: campaign.id };
  }
}
