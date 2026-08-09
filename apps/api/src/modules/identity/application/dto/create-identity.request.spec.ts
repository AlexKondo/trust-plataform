import { describe, expect, it } from 'vitest';
import { createIdentityRequestSchema } from './create-identity.request';

const validInput = {
  fullName: 'John Doe',
  email: 'john@example.com',
  password: 'Correct#Horse7Battery',
  confirmPassword: 'Correct#Horse7Battery',
  acceptTerms: true,
};

function issuePaths(input: unknown): string[] {
  const result = createIdentityRequestSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
}

describe('createIdentityRequestSchema (IDN-001 validators)', () => {
  it('aceita cadastro válido e normaliza e-mail para minúsculas', () => {
    const parsed = createIdentityRequestSchema.parse({
      ...validInput,
      email: 'John@Example.COM',
    });
    expect(parsed.email).toBe('john@example.com');
  });

  it('rejeita senha com menos de 12 caracteres (DOC-002, vence spec antiga de 8)', () => {
    expect(
      issuePaths({ ...validInput, password: 'Sh0rt#pw', confirmPassword: 'Sh0rt#pw' }),
    ).toContain('password');
  });

  it.each([
    ['sem maiúscula', 'correct#horse7battery'],
    ['sem minúscula', 'CORRECT#HORSE7BATTERY'],
    ['sem número', 'Correct#Horse!Battery'],
    ['sem caractere especial', 'CorrectHorse7Battery'],
  ])('rejeita senha %s', (_label, password) => {
    expect(issuePaths({ ...validInput, password, confirmPassword: password })).toContain(
      'password',
    );
  });

  it('rejeita senha contendo o nome do usuário', () => {
    const password = 'Str0ng#john!Extra';
    expect(issuePaths({ ...validInput, password, confirmPassword: password })).toContain(
      'password',
    );
  });

  it('rejeita confirmPassword diferente', () => {
    expect(issuePaths({ ...validInput, confirmPassword: 'Other#Horse7Battery' })).toContain(
      'confirmPassword',
    );
  });

  it('rejeita termos não aceitos (BR-005)', () => {
    expect(issuePaths({ ...validInput, acceptTerms: false })).toContain('acceptTerms');
  });

  it('rejeita e-mail inválido e nome com menos de 3 caracteres', () => {
    expect(issuePaths({ ...validInput, email: 'not-an-email' })).toContain('email');
    expect(issuePaths({ ...validInput, fullName: 'Jo' })).toContain('fullName');
  });
});
