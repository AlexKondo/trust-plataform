'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
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

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(!token);

  const submit = async () => {
    setFieldError(null);
    if (newPassword !== confirmPassword) {
      setFieldError('A confirmação deve ser igual à nova senha.');
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setFieldError('A senha não atende aos requisitos abaixo.');
      return;
    }
    setLoading(true);
    try {
      await api<void>('/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword },
      });
      router.push('/login?reset=1');
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'INVALID_RESET_TOKEN' || error.code === 'EXPIRED_RESET_TOKEN')
      ) {
        setTokenInvalid(true);
      } else if (error instanceof ApiError && error.code === 'PASSWORD_BREACHED') {
        setFieldError('Esta senha apareceu em vazamentos conhecidos. Escolha outra.');
      } else if (error instanceof ApiError) {
        setFieldError(error.message);
      } else {
        setFieldError('Não foi possível conectar ao servidor.');
      }
      setLoading(false);
    }
  };

  if (tokenInvalid) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-container">
          <Icon name="warning" size={44} />
        </div>
        <CardHeader
          title="Link inválido ou expirado"
          subtitle="Solicite uma nova recuperação de senha."
        />
        <PrimaryButton type="button" onClick={() => router.push('/forgot-password')}>
          Solicitar novamente
        </PrimaryButton>
      </div>
    );
  }

  return (
    <>
      <CardHeader title="Definir nova senha" />
      <Banner kind="info" icon="shield">
        Por segurança, todas as suas sessões serão encerradas e você precisará entrar novamente.
      </Banner>
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field id="newPassword" label="Nova senha" error={fieldError ?? undefined}>
          <PasswordInput id="newPassword" value={newPassword} onChange={setNewPassword} />
          <PasswordChecklist password={newPassword} />
        </Field>
        <Field id="confirmPassword" label="Confirmar nova senha">
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
        </Field>
        <PrimaryButton loading={loading} loadingLabel="Redefinindo...">
          Redefinir senha
        </PrimaryButton>
      </form>
      <div className="text-center">
        <Link className="body-sm text-primary hover:underline" href="/login">
          Voltar ao login
        </Link>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard>
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <Icon name="progress_activity" className="spinner text-primary" size={40} />
          </div>
        }
      >
        <ResetPasswordContent />
      </Suspense>
    </AuthCard>
  );
}
