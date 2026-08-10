'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { Card, Loading, PageHeader, Pill, SectionTitle } from '../../components/layout';
import { Banner, Field, Icon, PrimaryButton } from '../../components/ui';
import { ApiError, authApi } from '../../lib/api';
import type { TrustPassport } from '../../lib/types';

const ATTRIBUTES = [
  { key: 'emailVerified', label: 'E-mail', icon: 'mail', type: null },
  { key: 'phoneVerified', label: 'Telefone', icon: 'phone', type: 'PHONE' },
  { key: 'documentVerified', label: 'Documento', icon: 'badge', type: 'DOCUMENT' },
  { key: 'addressVerified', label: 'Endereço', icon: 'home_pin', type: 'ADDRESS' },
] as const;

function PassportContent() {
  const [passport, setPassport] = useState<TrustPassport | null>(null);
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('BR');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = (data: TrustPassport) => {
    setPassport(data);
    setPhone(data.phone ?? '');
    setCountry(data.address?.country ?? 'BR');
    setState(data.address?.state ?? '');
    setCity(data.address?.city ?? '');
  };

  useEffect(() => {
    void authApi<TrustPassport>('/trust-passports/me').then(load).catch(() => setPassport(null));
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = {};
    if (phone.trim()) {
      body.phone = phone.trim();
    }
    if (state.trim() && city.trim()) {
      body.address = { country: country.trim().toUpperCase(), state: state.trim(), city: city.trim() };
    }

    try {
      const updated = await authApi<TrustPassport>('/trust-passports/me', {
        method: 'PUT',
        body,
      });
      load(updated);
      setMessage({
        kind: 'success',
        text: 'Perfil atualizado. Alterar um dado já verificado revoga a verificação dele.',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível salvar agora.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!passport) {
    return <Loading label="Carregando seu Trust Passport..." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Trust Passport"
        subtitle="Sua identidade verificável na plataforma — os dados que sustentam sua reputação."
      />

      <Card>
        <SectionTitle
          icon="verified"
          title="Atributos verificados"
          hint="Cada atributo confirmado aumenta a completude do seu passaporte."
        />
        <div className="mb-6">
          <div className="mb-2 flex justify-between">
            <span className="label-bold text-on-surface-variant">COMPLETUDE</span>
            <span className="label-bold text-primary">{passport.profileCompletion}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-primary-container transition-all"
              style={{ width: `${passport.profileCompletion}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ATTRIBUTES.map((attribute) => {
            const verified = passport[attribute.key];
            return (
              <div
                key={attribute.key}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center ${
                  verified
                    ? 'border-secondary-container bg-secondary-container/30'
                    : 'border-outline-variant bg-surface-container-low'
                }`}
              >
                <Icon
                  name={verified ? 'verified' : attribute.icon}
                  filled={verified}
                  size={26}
                  className={verified ? 'text-teal' : 'text-outline'}
                />
                <span className="body-sm font-medium text-on-surface">{attribute.label}</span>
                <Pill tone={verified ? 'success' : 'neutral'}>
                  {verified ? 'Verificado' : 'Pendente'}
                </Pill>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle
          icon="edit"
          title="Dados do perfil"
          hint="Telefone e endereço são pré-requisitos para as verificações correspondentes."
        />
        <form className="flex flex-col gap-5" onSubmit={(event) => void handleSave(event)}>
          {message ? (
            <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
          ) : null}

          {passport.phoneVerified || passport.addressVerified ? (
            <Banner kind="warning">
              Alterar um dado já verificado revoga a verificação e ela precisará ser refeita.
            </Banner>
          ) : null}

          <Field id="phone" label="Telefone">
            <input
              id="phone"
              className="tds-input"
              value={phone}
              placeholder="+55 11 99999-0000"
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Field id="country" label="País">
              <input
                id="country"
                className="tds-input"
                value={country}
                maxLength={2}
                placeholder="BR"
                onChange={(event) => setCountry(event.target.value)}
              />
            </Field>
            <Field id="state" label="Estado">
              <input
                id="state"
                className="tds-input"
                value={state}
                placeholder="SP"
                onChange={(event) => setState(event.target.value)}
              />
            </Field>
            <Field id="city" label="Cidade">
              <input
                id="city"
                className="tds-input"
                value={city}
                placeholder="São Paulo"
                onChange={(event) => setCity(event.target.value)}
              />
            </Field>
          </div>

          <div className="md:w-64">
            <PrimaryButton loading={saving} loadingLabel="Salvando...">
              Salvar alterações
            </PrimaryButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function TrustPassportPage() {
  return (
    <AppShell>
      <PassportContent />
    </AppShell>
  );
}
