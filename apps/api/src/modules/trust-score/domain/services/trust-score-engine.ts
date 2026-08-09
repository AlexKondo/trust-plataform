/**
 * Trust Score Engine (TRS-003/004) — puro e determinístico (TP-003):
 * mesmas entradas ⇒ mesmo resultado; sem I/O; totalmente testável.
 * Escala 0–1000 (P4); condições JSON com semântica AND (P5).
 */

export const SCORE_MIN = 0;
export const SCORE_MAX = 1000;

export interface RuleCondition {
  field: string;
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value: unknown;
}

export interface ScoreRule {
  id: string;
  eventName: string;
  points: number;
  conditions: RuleCondition[];
  maxOccurrences: number | null;
  active: boolean;
}

export interface LevelRule {
  level: string;
  minScore: number;
  maxScore: number;
  rank: number;
  active: boolean;
}

/** Avalia as condições da regra contra o payload do evento (AND). */
export function conditionsMatch(conditions: RuleCondition[], payload: Record<string, unknown>): boolean {
  return conditions.every((condition) => {
    const actual = payload[condition.field];
    switch (condition.op) {
      case 'eq':
        return actual === condition.value;
      case 'ne':
        return actual !== condition.value;
      case 'gt':
        return typeof actual === 'number' && actual > Number(condition.value);
      case 'gte':
        return typeof actual === 'number' && actual >= Number(condition.value);
      case 'lt':
        return typeof actual === 'number' && actual < Number(condition.value);
      case 'lte':
        return typeof actual === 'number' && actual <= Number(condition.value);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(actual);
      default:
        return false;
    }
  });
}

/**
 * Seleciona a regra aplicável a um evento (TRS-002/009).
 * `previousMatches` = quantas vezes esta regra já pontuou para o passport
 * (para respeitar maxOccurrences). Retorna null se nada se aplica.
 */
export function matchRule(
  rules: ScoreRule[],
  eventName: string,
  payload: Record<string, unknown>,
  previousMatchesByRule: Map<string, number>,
): ScoreRule | null {
  for (const rule of rules) {
    if (!rule.active || rule.eventName !== eventName) {
      continue;
    }
    if (!conditionsMatch(rule.conditions, payload)) {
      continue;
    }
    const used = previousMatchesByRule.get(rule.id) ?? 0;
    if (rule.maxOccurrences !== null && used >= rule.maxOccurrences) {
      continue;
    }
    return rule;
  }
  return null;
}

/** TRS-003: soma dos pontos dos trust events, sempre dentro de [0, 1000]. */
export function calculateScore(pointsHistory: number[]): number {
  const total = pointsHistory.reduce((sum, points) => sum + points, 0);
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, total));
}

/** TRS-004: faixa ativa que contém o score (maior rank vence em sobreposição). */
export function determineLevel(levelRules: LevelRule[], score: number): string {
  const applicable = levelRules
    .filter((rule) => rule.active && score >= rule.minScore && score <= rule.maxScore)
    .sort((a, b) => b.rank - a.rank);
  return applicable[0]?.level ?? 'UNVERIFIED';
}
