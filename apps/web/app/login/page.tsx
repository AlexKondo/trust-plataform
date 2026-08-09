'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api, tokenStore } from '../../lib/api';
import {
  AuthCard,
  Banner,
  CardHeader,
  Field,
  PasswordInput,
  PrimaryButton,
} from '../../components/ui';

type LoginBanner =
  | { kind: 'error'; text: string }
  | { kind: 'warning'; text: string }
  | null;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<LoginBanner>(null);

  const submit = async () => {
    setBanner(null);
    setLoading(true);
    try {
      const data = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      tokenStore.set(data.accessToken, data.refreshToken);
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'ACCOUNT_LOCKED') {
          setBanner({
            kind: 'warning',
            text: 'Conta bloqueada temporariamente por tentativas incorretas. Tente novamente em alguns minutos.',
          });
        } else if (error.code === 'IDENTITY_NOT_ACTIVE') {
          setBanner({
            kind: 'warning',
            text: 'Sua conta ainda não foi ativada. Confirme seu e-mail pelo link que enviamos.',
          });
        } else {
          setBanner({ kind: 'error', text: 'E-mail ou senha inválidos.' });
        }
      } else {
        setBanner({ kind: 'error', text: 'Não foi possível conectar ao servidor.' });
      }
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <CardHeader title="Bem-vindo(a) de volta" subtitle="Entre para acessar sua conta" />
      {banner ? <Banner kind={banner.kind}>{banner.text}</Banner> : null}
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field id="email" label="E-mail">
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
        <div className="flex flex-col gap-2">
          <Field id="password" label="Senha">
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </Field>
          <div className="flex justify-end">
            <Link className="body-sm text-primary hover:underline" href="/forgot-password">
              Esqueci minha senha
            </Link>
          </div>
        </div>
        <PrimaryButton loading={loading} loadingLabel="Entrando...">
          Entrar
        </PrimaryButton>
      </form>
      <div className="mt-2 text-center">
        <p className="body-sm text-on-surface-variant">
          Não tem uma conta?{' '}
          <Link className="font-semibold text-primary hover:underline" href="/register">
            Criar conta
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
