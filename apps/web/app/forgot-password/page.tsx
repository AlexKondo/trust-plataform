'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../lib/api';
import { AuthCard, CardHeader, Field, Icon, PrimaryButton } from '../../components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
    } catch {
      // resposta pública é sempre a mesma — nunca revelar se a conta existe
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      {sent ? (
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-fixed text-primary">
            <Icon name="send" size={40} />
          </div>
          <CardHeader
            title="Verifique seu e-mail"
            subtitle="Se existir uma conta para este e-mail, as instruções de recuperação foram enviadas. O link vale por 30 minutos."
          />
          <Link className="body-sm text-primary hover:underline" href="/login">
            Voltar ao login
          </Link>
        </div>
      ) : (
        <>
          <CardHeader
            title="Recuperar senha"
            subtitle="Informe seu e-mail e enviaremos as instruções"
          />
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
            <PrimaryButton loading={loading} loadingLabel="Enviando...">
              Enviar instruções
            </PrimaryButton>
          </form>
          <div className="text-center">
            <Link className="body-sm text-primary hover:underline" href="/login">
              Voltar ao login
            </Link>
          </div>
        </>
      )}
    </AuthCard>
  );
}
