/**
 * IP-011 — Trust Signal registry: typed and versioned, pure (TP-003 style,
 * no I/O). Every signal this platform is allowed to record MUST be declared
 * here first — the same discipline `trust_score_rules` applies to scoring,
 * applied to non-scoring observations.
 *
 * IMPORTANT — this registry never assigns points and is never read by
 * `trust-score-engine.ts`. §4 of IP-011 ("no unapproved punitive score
 * rule") means: a signal type here is NOT a backdoor to influence
 * Score/Level. If a signal is later approved to affect score, the approved
 * mechanism is a new `trust_score_rules` row keyed on the SAME
 * `sourceEventName` — this registry stays purely observational.
 *
 * `reasonKey` is an i18n key (IP-002), not display text — actual copy lives
 * in `apps/web/lib/i18n/messages/*.ts` under `trustSignals.<reasonKey>`.
 */
export type TrustSignalVisibility = 'PUBLIC' | 'PRIVATE';

export interface TrustSignalDefinition {
  /** Stable catalog key stored in `trust_signals.signal_type`. */
  signalType: string;
  /** Bumped when the semantics/shape of the signal changes materially. */
  version: string;
  /** Domain event this signal is derived from. */
  sourceEventName: string;
  /** i18n key for the human-readable explanation (never raw copy). */
  reasonKey: string;
  /** Default visibility for a newly recorded row of this signal type. */
  defaultVisibility: TrustSignalVisibility;
  /** Explicitly documents that this signal never mutates Score/Level. */
  affectsScore: false;
}

/**
 * Gaps identified in the IP-011 preflight (event catalog vs. `trust_score_rules`):
 * TrustChangeOrder lifecycle and voluntary refunds are objective facts that
 * are NOT covered by any approved scoring rule (INCONSISTENCIAS #13 only
 * lists Order confirm/cancel, Review, Dispute). Registering them here makes
 * them observable/explainable on the timeline without inventing score
 * effects — see IP-011 Conflict Escalation for the case that a future
 * approved rule may want to score change-order rejection rate / refund
 * frequency.
 */
export const TRUST_SIGNAL_REGISTRY: readonly TrustSignalDefinition[] = [
  {
    signalType: 'CHANGE_ORDER_SUBMITTED',
    version: '1',
    sourceEventName: 'TrustChangeOrder.Submitted',
    reasonKey: 'CHANGE_ORDER_SUBMITTED',
    defaultVisibility: 'PRIVATE',
    affectsScore: false,
  },
  {
    signalType: 'CHANGE_ORDER_APPROVED',
    version: '1',
    sourceEventName: 'TrustChangeOrder.Approved',
    reasonKey: 'CHANGE_ORDER_APPROVED',
    defaultVisibility: 'PRIVATE',
    affectsScore: false,
  },
  {
    signalType: 'CHANGE_ORDER_REJECTED',
    version: '1',
    sourceEventName: 'TrustChangeOrder.Rejected',
    reasonKey: 'CHANGE_ORDER_REJECTED',
    defaultVisibility: 'PRIVATE',
    affectsScore: false,
  },
  {
    signalType: 'FUNDS_REFUND_COMPLETED',
    version: '1',
    sourceEventName: 'FundsRefund.Completed',
    reasonKey: 'FUNDS_REFUND_COMPLETED',
    defaultVisibility: 'PRIVATE',
    affectsScore: false,
  },
] as const;

const BY_SOURCE_EVENT = new Map(
  TRUST_SIGNAL_REGISTRY.map((definition) => [definition.sourceEventName, definition]),
);

/** Resolves the signal definition for a given domain event, if any is registered. */
export function findSignalDefinition(sourceEventName: string): TrustSignalDefinition | undefined {
  return BY_SOURCE_EVENT.get(sourceEventName);
}
