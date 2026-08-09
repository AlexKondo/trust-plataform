'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import {
  AuthCard,
  Banner,
  CardHeader,
  Field,
  Icon,
  PasswordChecklist,
  PasswordInput,
  PrimaryButton,
  isPasswordValid,
} from '../../components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    setFormError(null);
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'A confirmação deve ser igual à senha.' });
      return;
    }
    if (!isPasswordValid(password)) {
      setFieldErrors({ password: 'A senha não atende aos requisitos abaixo.' });
      return;
    }
    if (!acceptTerms) {
      setFieldErrors({ acceptTerms: 'Você precisa aceitar os Termos de Uso.' });
      return;
    }

    setLoading(true);
    try {
      const data = await api<{ identityId: string; status: string }>('/identities', {
        method: 'POST',
        body: { fullName, email, password, confirmPassword, acceptTerms },
      });
      router.push(
        `/verify-email?sent=1&email=${encodeURIComponent(email)}&id=${data.identityId}`,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'EMAIL_ALREADY_EXISTS') {
          setFieldErrors({ email: 'Este e-mail já está cadastrado.' });
        } else if (error.code === 'PASSWORD_BREACHED') {
          setFieldErrors({
            password: 'Esta senha apareceu em vazamentos conhecidos. Escolha outra.',
          });
        } else if (error.code === 'VALIDATION_ERROR' && error.details) {
          setFieldErrors(
            Object.fromEntries(error.details.map((d) => [d.path, d.message])),
          );
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError('Não foi possível conectar ao servidor. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <CardHeader title="Criar sua conta" subtitle="Comece a construir sua reputação digital" />
      {formError ? <Banner kind="error">{formError}</Banner> : null}
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field id="fullName" label="Nome completo" error={fieldErrors.fullName}>
          <input
            id="fullName"
            className="tds-input"
            placeholder="Seu nome"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </Field>
        <Field id="email" label="E-mail" error={fieldErrors.email}>
          <input
            id="email"
            className="tds-input"
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field id="password" label="Senha" error={fieldErrors.password}>
          <PasswordInput id="password" value={password} onChange={setPassword} />
          <PasswordChecklist password={password} />
        </Field>
        <Field id="confirmPassword" label="Confirmar senha" error={fieldErrors.confirmPassword}>
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
        </Field>

        <div className="mt-2 flex items-start gap-3">
          <input
            id="terms"
            type="checkbox"
            checked={acceptTerms}
            onChange={(event) => setAcceptTerms(event.target.checked)}
            className="mt-1 h-4 w-4 cursor-pointer rounded border-outline-variant text-primary-container"
          />
          <label htmlFor="terms" className="body-sm cursor-pointer select-none text-on-surface-variant">
            Li e aceito os{' '}
            <a className="text-primary-container underline-offset-2 hover:underline" href="#">
              Termos de Uso
            </a>{' '}
            e a{' '}
            <a className="text-primary-container underline-offset-2 hover:underline" href="#">
              Política de Privacidade
            </a>
          </label>
        </div>
        {fieldErrors.acceptTerms ? (
          <p className="body-sm -mt-4 text-error">{fieldErrors.acceptTerms}</p>
        ) : null}

        <PrimaryButton loading={loading} loadingLabel="Criando conta...">
          Criar conta
          <Icon name="arrow_forward" size={20} />
        </PrimaryButton>
      </form>

      <div className="mt-2 flex flex-col items-center gap-4">
        <div className="h-px w-full bg-outline-variant/50" />
        <p className="body-sm text-on-surface-variant">
          Já tem uma conta?{' '}
          <Link className="label-bold text-primary-container underline-offset-2 hover:underline" href="/login">
            Entrar
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
