import { describe, expect, it } from 'vitest';
import {
  LevelRule,
  ScoreRule,
  calculateScore,
  conditionsMatch,
  determineLevel,
  matchRule,
} from './trust-score-engine';

const LEVELS: LevelRule[] = [
  { level: 'UNVERIFIED', minScore: 0, maxScore: 0, rank: 0, active: true },
  { level: 'BRONZE', minScore: 1, maxScore: 249, rank: 1, active: true },
  { level: 'SILVER', minScore: 250, maxScore: 499, rank: 2, active: true },
  { level: 'GOLD', minScore: 500, maxScore: 749, rank: 3, active: true },
  { level: 'PLATINUM', minScore: 750, maxScore: 1000, rank: 4, active: true },
];

describe('TrustScoreEngine (TRS-003/004) — determinístico', () => {
  it('calcula a soma com clamp em [0, 1000] (escala P4)', () => {
    expect(calculateScore([])).toBe(0);
    expect(calculateScore([25, 150, 100])).toBe(275);
    expect(calculateScore([-100])).toBe(0); // nunca negativo
    expect(calculateScore([900, 500])).toBe(1000); // teto
  });

  it('determina o nível pela faixa (seed P4)', () => {
    expect(determineLevel(LEVELS, 0)).toBe('UNVERIFIED');
    expect(determineLevel(LEVELS, 25)).toBe('BRONZE');
    expect(determineLevel(LEVELS, 275)).toBe('SILVER');
    expect(determineLevel(LEVELS, 500)).toBe('GOLD');
    expect(determineLevel(LEVELS, 1000)).toBe('PLATINUM');
  });

  it('nível ignora faixas inativas e resolve sobreposição pelo maior rank', () => {
    const custom: LevelRule[] = [
      ...LEVELS,
      { level: 'DIAMOND', minScore: 900, maxScore: 1000, rank: 5, active: true },
      { level: 'DISABLED', minScore: 0, maxScore: 1000, rank: 99, active: false },
    ];
    expect(determineLevel(custom, 950)).toBe('DIAMOND');
    expect(determineLevel(custom, 100)).toBe('BRONZE');
  });

  it('conditionsMatch avalia AND com todos os operadores', () => {
    const payload = { type: 'DOCUMENT', amount: 10 };
    expect(conditionsMatch([{ field: 'type', op: 'eq', value: 'DOCUMENT' }], payload)).toBe(true);
    expect(conditionsMatch([{ field: 'type', op: 'ne', value: 'ADDRESS' }], payload)).toBe(true);
    expect(conditionsMatch([{ field: 'amount', op: 'gte', value: 10 }], payload)).toBe(true);
    expect(conditionsMatch([{ field: 'amount', op: 'lt', value: 10 }], payload)).toBe(false);
    expect(
      conditionsMatch([{ field: 'type', op: 'in', value: ['DOCUMENT', 'BIOMETRIC'] }], payload),
    ).toBe(true);
    expect(
      conditionsMatch(
        [
          { field: 'type', op: 'eq', value: 'DOCUMENT' },
          { field: 'amount', op: 'gt', value: 99 },
        ],
        payload,
      ),
    ).toBe(false); // AND: uma falha derruba
  });

  it('matchRule respeita eventName, condições, active e maxOccurrences', () => {
    const rules: ScoreRule[] = [
      {
        id: 'r-doc',
        eventName: 'Verification.Approved',
        points: 150,
        conditions: [{ field: 'type', op: 'eq', value: 'DOCUMENT' }],
        maxOccurrences: 1,
        active: true,
      },
      {
        id: 'r-addr',
        eventName: 'Verification.Approved',
        points: 100,
        conditions: [{ field: 'type', op: 'eq', value: 'ADDRESS' }],
        maxOccurrences: 1,
        active: true,
      },
      {
        id: 'r-off',
        eventName: 'Verification.Approved',
        points: 999,
        conditions: [],
        maxOccurrences: null,
        active: false,
      },
    ];

    const none = new Map<string, number>();
    expect(matchRule(rules, 'Verification.Approved', { type: 'DOCUMENT' }, none)?.id).toBe('r-doc');
    expect(matchRule(rules, 'Verification.Approved', { type: 'ADDRESS' }, none)?.id).toBe('r-addr');
    expect(matchRule(rules, 'Outro.Evento', { type: 'DOCUMENT' }, none)).toBeNull();

    // maxOccurrences: segunda aprovação de DOCUMENT não pontua
    const used = new Map([['r-doc', 1]]);
    expect(matchRule(rules, 'Verification.Approved', { type: 'DOCUMENT' }, used)).toBeNull();
  });
});
