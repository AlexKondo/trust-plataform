import { describe, expect, it } from 'vitest';
import { TRUST_SIGNAL_REGISTRY, findSignalDefinition } from './trust-signal-registry';

describe('TRUST_SIGNAL_REGISTRY (IP-011)', () => {
  it('every entry explicitly declares affectsScore: false — the whole point of a "signal"', () => {
    for (const definition of TRUST_SIGNAL_REGISTRY) {
      expect(definition.affectsScore).toBe(false);
    }
  });

  it('signalType and sourceEventName are unique across the registry (no ambiguous mapping)', () => {
    const signalTypes = TRUST_SIGNAL_REGISTRY.map((d) => d.signalType);
    const sourceEvents = TRUST_SIGNAL_REGISTRY.map((d) => d.sourceEventName);
    expect(new Set(signalTypes).size).toBe(signalTypes.length);
    expect(new Set(sourceEvents).size).toBe(sourceEvents.length);
  });

  it('resolves a registered domain event to its signal definition', () => {
    const definition = findSignalDefinition('TrustChangeOrder.Submitted');
    expect(definition?.signalType).toBe('CHANGE_ORDER_SUBMITTED');
    expect(definition?.affectsScore).toBe(false);
  });

  it('returns undefined for an event that has an approved scoring rule instead (never double-registers)', () => {
    // MarketplaceOrder.CustomerConfirmed already scores via trust_score_rules
    // (INCONSISTENCIAS #13) — it must NOT also be a signal type here, or a
    // future dev could be tempted to wire a duplicate/competing pipeline.
    expect(findSignalDefinition('MarketplaceOrder.CustomerConfirmed')).toBeUndefined();
    expect(findSignalDefinition('MarketplaceReview.Created')).toBeUndefined();
    expect(findSignalDefinition('MarketplaceDispute.Resolved')).toBeUndefined();
  });

  it('returns undefined for an unknown/uncatalogued event (fail-closed)', () => {
    expect(findSignalDefinition('SomeModule.SomethingThatIsNotRegistered')).toBeUndefined();
  });
});
