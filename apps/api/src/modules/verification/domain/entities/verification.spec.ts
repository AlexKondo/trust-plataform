import { describe, expect, it } from 'vitest';
import { Verification } from './verification';
import { InvalidVerificationStatusException } from '../exceptions/verification.exceptions';

function makeVerification() {
  return Verification.createNew({
    trustPassportId: 'tp-1',
    identityId: 'id-1',
    type: 'DOCUMENT',
    attempt: 1,
  });
}

describe('Verification aggregate — máquina de estados (VRF-001..005)', () => {
  it('nasce WAITING_FOR_EVIDENCE (BR-005) com requisitos do tipo', () => {
    const verification = makeVerification();
    expect(verification.status).toBe('WAITING_FOR_EVIDENCE');
    expect(verification.requiredEvidenceTypes).toEqual(['DOCUMENT_FRONT', 'DOCUMENT_BACK']);
  });

  it('só avança para PENDING_REVIEW com TODAS as evidências obrigatórias (BR-005/006)', () => {
    const verification = makeVerification();

    expect(verification.evidenceSubmitted(['DOCUMENT_FRONT'])).toBe(false);
    expect(verification.status).toBe('WAITING_FOR_EVIDENCE');

    expect(verification.evidenceSubmitted(['DOCUMENT_FRONT', 'DOCUMENT_BACK'])).toBe(true);
    expect(verification.status).toBe('PENDING_REVIEW');
  });

  it('fluxo feliz completo: evidências → review → aprovação', () => {
    const verification = makeVerification();
    verification.evidenceSubmitted(['DOCUMENT_FRONT', 'DOCUMENT_BACK']);
    verification.startReview();
    expect(verification.status).toBe('IN_REVIEW');
    verification.approve();
    expect(verification.status).toBe('APPROVED');
  });

  it('rejeição também encerra o fluxo', () => {
    const verification = makeVerification();
    verification.evidenceSubmitted(['DOCUMENT_FRONT', 'DOCUMENT_BACK']);
    verification.startReview();
    verification.reject();
    expect(verification.status).toBe('REJECTED');
  });

  it('transições inválidas lançam 409 (decisões irreversíveis, BR-006/007)', () => {
    const verification = makeVerification();

    // review sem evidências completas
    expect(() => verification.startReview()).toThrow(InvalidVerificationStatusException);
    // aprovar sem review
    expect(() => verification.approve()).toThrow(InvalidVerificationStatusException);

    verification.evidenceSubmitted(['DOCUMENT_FRONT', 'DOCUMENT_BACK']);
    verification.startReview();
    verification.approve();

    // aprovado não volta atrás nem recebe evidência
    expect(() => verification.startReview()).toThrow(InvalidVerificationStatusException);
    expect(() => verification.reject()).toThrow(InvalidVerificationStatusException);
    expect(() => verification.assertAcceptsEvidence()).toThrow(
      InvalidVerificationStatusException,
    );
  });
});
