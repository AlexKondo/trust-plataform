'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import { Card, EmptyState, ErrorState, Loading, PageHeader, SectionTitle } from '../../../components/layout';
import { Banner, Field, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi } from '../../../lib/api';
import { useLocale } from '../../../lib/i18n/LocaleProvider';
import type { AvailabilityWindowInput, PartnerAvailabilityWindow } from '../../../lib/types';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** "09:00" <-> 540 (minutos desde meia-noite). Só formatação de UI — a API já valida os limites (0–1439/1–1440). */
function minutesToClock(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const rest = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${rest}`;
}

function clockToMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function newWindow(): AvailabilityWindowInput {
  return { dayOfWeek: 1, startMinute: 480, endMinute: 1080, timezone: DEFAULT_TIMEZONE };
}

function PartnerAvailabilityContent() {
  const { t } = useLocale();
  const [windows, setWindows] = useState<AvailabilityWindowInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const mine = await authApi<PartnerAvailabilityWindow[]>('/marketplace/partner-availability/mine');
      setWindows(
        mine.map((window) => ({
          dayOfWeek: window.dayOfWeek,
          startMinute: window.startMinute,
          endMinute: window.endMinute,
          timezone: window.timezone,
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('partner.availabilityLoadError'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateWindow = (index: number, patch: Partial<AvailabilityWindowInput>) => {
    setWindows((current) =>
      current ? current.map((window, i) => (i === index ? { ...window, ...patch } : window)) : current,
    );
  };

  const removeWindow = (index: number) => {
    setWindows((current) => (current ? current.filter((_, i) => i !== index) : current));
  };

  const addWindow = () => {
    setWindows((current) => [...(current ?? []), newWindow()]);
  };

  const save = async () => {
    if (!windows) return;
    setBusy(true);
    setFeedback(null);
    try {
      // Replace-all: a API não faz patch parcial (IP-005) — o cliente sempre manda o conjunto inteiro.
      await authApi('/marketplace/partner-availability', { method: 'PUT', body: { windows } });
      setFeedback({ kind: 'success', text: t('partner.availabilitySaved') });
      await load();
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : t('partner.availabilitySaveError'),
      });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!windows) {
    return <Loading label={t('common.loading')} />;
  }

  const weekdayLabel = (day: number): string => t(`partner.weekday.d${day}` as Parameters<typeof t>[0]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('partner.availabilityTitle')} subtitle={t('partner.availabilitySubtitle')} />

      {feedback ? (
        <Banner kind={feedback.kind === 'success' ? 'success' : 'error'}>{feedback.text}</Banner>
      ) : null}

      <Card>
        <SectionTitle icon="event_available" title={t('partner.availabilityTitle')} />
        {windows.length === 0 ? (
          <EmptyState icon="event_busy" title={t('partner.availabilityEmpty')} />
        ) : (
          <ul className="flex flex-col gap-4">
            {windows.map((window, index) => (
              <li
                key={index}
                className="grid grid-cols-1 gap-3 rounded-lg border border-outline-variant p-4 sm:grid-cols-4 sm:items-end"
              >
                <Field id={`day-${index}`} label={t('partner.availabilityDay')}>
                  <select
                    id={`day-${index}`}
                    className="tds-input"
                    value={window.dayOfWeek}
                    onChange={(event) => updateWindow(index, { dayOfWeek: Number(event.target.value) })}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <option key={day} value={day}>
                        {weekdayLabel(day)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`start-${index}`} label={t('partner.availabilityStart')}>
                  <input
                    id={`start-${index}`}
                    type="time"
                    className="tds-input"
                    value={minutesToClock(window.startMinute)}
                    onChange={(event) =>
                      updateWindow(index, { startMinute: clockToMinutes(event.target.value) })
                    }
                  />
                </Field>
                <Field id={`end-${index}`} label={t('partner.availabilityEnd')}>
                  <input
                    id={`end-${index}`}
                    type="time"
                    className="tds-input"
                    value={minutesToClock(window.endMinute)}
                    onChange={(event) =>
                      updateWindow(index, { endMinute: clockToMinutes(event.target.value) })
                    }
                  />
                </Field>
                <SecondaryButton onClick={() => removeWindow(index)}>
                  {t('partner.availabilityRemoveWindow')}
                </SecondaryButton>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <SecondaryButton onClick={addWindow}>{t('partner.availabilityAddWindow')}</SecondaryButton>
          <PrimaryButton type="button" loading={busy} onClick={() => void save()}>
            {t('partner.availabilitySaveAll')}
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

export default function PartnerAvailabilityPage() {
  return (
    <AppShell>
      <PartnerAvailabilityContent />
    </AppShell>
  );
}
