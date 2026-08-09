'use client';

import { useState } from 'react';
import { AppShell } from '../../../../components/app-shell';
import { ApiError, authApi } from '../../../../lib/api';
import {
  Banner,
  Field,
  PasswordChecklist,
  PasswordInput,
  PrimaryButton,
  isPasswordValid,
} from '../../../../components/ui';

function ChangePasswordContent() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    setSuccess(false);
    setFieldErrors({});
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'A confirmação deve ser igual à nova senha.' });
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setFieldErrors({ newPassword: 'A senha não atende aos requisitos abaixo.' });
      return;
    }
    setLoading(true);
    try {
      await authApi<void>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CURRENT_PASSWORD_INVALID') {
        setFieldErrors({ currentPassword: 'Senha atual incorreta.' });
      } else if (error instanceof ApiError && error.code === 'SAME_PASSWORD') {
        setFieldErrors({ newPassword: 'A nova senha deve ser diferente da atual.' });
      } else if (error instanceof ApiError && error.code === 'PASSWORD_BREACHED') {
        setFieldErrors({
          newPassword: 'Esta senha apareceu em vazamentos conhecidos. Escolha outra.',
        });
      } else if (error instanceof ApiError) {
        setFieldErrors({ currentPassword: error.message });
      } else {
        setFieldErrors({ currentPassword: 'Não foi possível conectar ao servidor.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="headline-lg text-on-surface">Segurança</h1>
        <p className="body-lg mt-1 text-on-surface-variant">Alterar senha</p>
      </div>

      {success ? (
        <Banner kind="success" icon="check_circle">
          Senha alterada com sucesso. Suas outras sessões foram encerradas.
        </Banner>
      ) : null}

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-ambient">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field id="currentPassword" label="Senha atual" error={fieldErrors.currentPassword}>
            <PasswordInput
              id="currentPassword"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
          </Field>
          <Field id="newPassword" label="Nova senha" error={fieldErrors.newPassword}>
            <PasswordInput id="newPassword" value={newPassword} onChange={setNewPassword} />
            <PasswordChecklist password={newPassword} />
          </Field>
          <Field
            id="confirmPassword"
            label="Confirmar nova senha"
            error={fieldErrors.confirmPassword}
          >
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </Field>
          <Banner kind="info" icon="shield">
            Suas outras sessões serão encerradas. Esta sessão permanecerá ativa.
          </Banner>
          <PrimaryButton loading={loading} loadingLabel="Salvando...">
            Salvar nova senha
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <AppShell>
      <ChangePasswordContent />
    </AppShell>
  );
}
