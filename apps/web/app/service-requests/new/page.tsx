'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import { Card, PageHeader, SectionTitle } from '../../../components/layout';
import { Banner, Field, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi } from '../../../lib/api';
import { URGENCY_LABEL } from '../../../lib/labels';
import type { ServiceRequest } from '../../../lib/types';

const URGENCY_OPTIONS = ['IMMEDIATE', 'THIS_WEEK', 'FLEXIBLE'];

/**
 * IP-003 — Trust Member descreve a necessidade e cria um ServiceRequest.
 * Sem regra de negócio no cliente: elegibilidade, matching e validação de
 * faixa de orçamento são tudo decidido pela API (`POST /marketplace/service-requests`).
 */
function CreateServiceRequestContent() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [radiusKm, setRadiusKm] = useState('20');
  const [urgency, setUrgency] = useState('FLEXIBLE');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    title.trim().length >= 5 && description.trim().length >= 20 && category.trim().length >= 2 && locationLabel.trim().length >= 2;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await authApi<ServiceRequest>('/marketplace/service-requests', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim(),
          category: category.trim(),
          locationLabel: locationLabel.trim(),
          radiusKm: radiusKm ? Number(radiusKm) : undefined,
          urgency,
          budgetMinAmount: budgetMin ? Number(budgetMin) : undefined,
          budgetMaxAmount: budgetMax ? Number(budgetMax) : undefined,
        },
      });
      router.push(`/service-requests/${created.serviceRequestId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o pedido agora.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Descrever uma necessidade"
        subtitle="Conte o que você precisa. Trust Partners elegíveis poderão enviar propostas."
        back={{ href: '/service-requests', label: 'Meus pedidos de serviço' }}
      />

      {error ? <Banner kind="error">{error}</Banner> : null}

      <Card>
        <SectionTitle icon="edit_note" title="Detalhes" />
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field id="title" label="Título (mínimo 5 caracteres)">
            <input
              id="title"
              className="tds-input"
              value={title}
              maxLength={255}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </Field>
          <Field id="description" label="Descrição (mínimo 20 caracteres)">
            <textarea
              id="description"
              className="tds-input min-h-28 resize-y"
              value={description}
              maxLength={5000}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
          </Field>
          <Field id="category" label="Categoria (ex.: ELECTRICAL)">
            <input
              id="category"
              className="tds-input"
              value={category}
              maxLength={60}
              onChange={(event) => setCategory(event.target.value.toUpperCase())}
              required
            />
          </Field>
          <Field id="location" label="Localização">
            <input
              id="location"
              className="tds-input"
              value={locationLabel}
              maxLength={160}
              onChange={(event) => setLocationLabel(event.target.value)}
              required
            />
          </Field>
          <Field id="radius" label="Raio de busca (km)">
            <input
              id="radius"
              type="number"
              min="1"
              max="500"
              className="tds-input"
              value={radiusKm}
              onChange={(event) => setRadiusKm(event.target.value)}
            />
          </Field>
          <Field id="urgency" label="Urgência">
            <select
              id="urgency"
              className="tds-input"
              value={urgency}
              onChange={(event) => setUrgency(event.target.value)}
            >
              {URGENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {URGENCY_LABEL[option]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="budgetMin" label="Orçamento mínimo (opcional)">
              <input
                id="budgetMin"
                type="number"
                min="0"
                step="0.01"
                className="tds-input"
                value={budgetMin}
                onChange={(event) => setBudgetMin(event.target.value)}
              />
            </Field>
            <Field id="budgetMax" label="Orçamento máximo (opcional)">
              <input
                id="budgetMax"
                type="number"
                min="0"
                step="0.01"
                className="tds-input"
                value={budgetMax}
                onChange={(event) => setBudgetMax(event.target.value)}
              />
            </Field>
          </div>
          <PrimaryButton type="submit" loading={busy} disabled={!valid}>
            Publicar necessidade
          </PrimaryButton>
          <SecondaryButton onClick={() => router.push('/service-requests')}>Cancelar</SecondaryButton>
        </form>
      </Card>
    </div>
  );
}

export default function NewServiceRequestPage() {
  return (
    <AppShell>
      <CreateServiceRequestContent />
    </AppShell>
  );
}
