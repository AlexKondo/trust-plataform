'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import {
  AuthCard,
  CardHeader,
  Icon,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui';

type State =
  | { kind: 'notice' }
  | { kind: 'verifying' }
  | { kind: 'success' }
  | { kind: 'already' }
  | { kind: 'error' };

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');
  const identityId = params.get('id');

  const [state, setState] = useState<State>(token ? { kind: 'verifying' } : { kind: 'notice' });
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const verifying = useRef(false);

  useEffect(() => {
    if (!token || verifying.current) {
      return;
    }
    verifying.current = true;
    api<{ status: string }>(`/identities/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setState({ kind: 'success' }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_VERIFIED') {
          setState({ kind: 'already' });
        } else {
          setState({ kind: 'error' });
        }
      });
  }, [token]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    if (!identityId) {
      return;
    }
    setResending(true);
    try {
      await api<void>(`/identities/${identityId}/verify-email`, { method: 'POST' });
      setCooldown(60);
    } catch {
      // já verificado ou indisponível — o estado da tela cobre
    } finally {
      setResending(false);
    }
  };

  if (state.kind === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Icon name="progress_activity" className="spinner text-primary" size={40} />
        <p className="body-lg text-on-surface-variant">Validando seu link...</p>
      </div>
    );
  }

  if (state.kind === 'success' || state.kind === 'already') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
          <Icon name="check_circle" filled size={44} />
        </div>
        <CardHeader
          title={state.kind === 'success' ? 'E-mail confirmado!' : 'E-mail já confirmado'}
          subtitle="Sua conta está ativa. Faça login para começar."
        />
        <PrimaryButton type="button" onClick={() => router.push('/login')}>
          Ir para o login
        </PrimaryButton>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-container">
          <Icon name="warning" size={44} />
        </div>
        <CardHeader
          title="Link inválido ou expirado"
          subtitle="Este link de confirmação não é mais válido. Solicite um novo para continuar."
        />
        {identityId ? (
          <PrimaryButton type="button" onClick={() => void resend()} loading={resending}>
            Reenviar e-mail de confirmação
          </PrimaryButton>
        ) : null}
        <Link className="body-sm text-primary hover:underline" href="/login">
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-fixed text-primary">
        <Icon name="mark_email_read" size={44} />
      </div>
      <CardHeader
        title="Confirme seu e-mail"
        subtitle={`Enviamos um link de confirmação para ${email ?? 'seu e-mail'}. O link vale por 24 horas.`}
      />
      {identityId ? (
        <SecondaryButton onClick={() => void resend()} disabled={cooldown > 0 || resending}>
          {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar e-mail'}
        </SecondaryButton>
      ) : null}
      <p className="body-sm text-on-surface-variant">Não encontrou? Verifique sua caixa de spam.</p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCard>
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <Icon name="progress_activity" className="spinner text-primary" size={40} />
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </AuthCard>
  );
}
