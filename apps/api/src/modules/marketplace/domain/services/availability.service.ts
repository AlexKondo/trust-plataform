/**
 * IP-005 — verifica se uma janela de agendamento pedida (`scheduledStart` até
 * `scheduledEnd`, ambos instantes UTC) cabe DENTRO de alguma disponibilidade
 * que o Partner declarou (`PartnerAvailabilityWindow`).
 *
 * Puro por design: só datas + aritmética, nenhuma dependência de infra (nem
 * de mapas, nem de banco) — para poder ser chamado tanto no agendamento
 * inicial quanto no reagendamento, e testado sem nenhum mock.
 *
 * Regra deliberadamente conservadora: se o Partner não declarou NENHUMA
 * janela, não existe restrição (comportamento idêntico ao que já existia
 * antes desta IP — ninguém que hoje agenda um pedido é afetado). Se a janela
 * pedida atravessa a meia-noite local (começa num dia, termina no seguinte),
 * é recusada — não existe hoje um conceito de "janela que atravessa dias" no
 * agendamento (MRK-019 BR-002/003), e fingir que atravessar meia-noite sempre
 * cabe seria inventar uma regra sem existir decisão de produto para isso.
 */

export interface AvailabilityWindowLike {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface LocalInstant {
  dayOfWeek: number;
  minuteOfDay: number;
}

/** Dia da semana (0=domingo) e minuto do dia de um instante, no fuso dado. */
export function localInstant(date: Date, timezone: string): LocalInstant {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const weekdayShort = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // Algumas implementações de ICU formatam meia-noite como "24" em vez de "00".
  return { dayOfWeek: WEEKDAY_INDEX[weekdayShort] ?? 0, minuteOfDay: (hour % 24) * 60 + minute };
}

export function fitsAvailability(
  windows: readonly AvailabilityWindowLike[],
  scheduledStart: Date,
  scheduledEnd: Date,
  timezone: string,
): boolean {
  if (windows.length === 0) {
    return true;
  }

  const start = localInstant(scheduledStart, timezone);
  const end = localInstant(scheduledEnd, timezone);
  // scheduledEnd cai EXATAMENTE na meia-noite (minuteOfDay === 0) do dia
  // seguinte é tratado como "termina no fim do mesmo dia local" (1440), não
  // como atravessar o dia — evita recusar uma janela que só coincidentemente
  // termina no instante 00:00.
  const endMinuteOfDay = end.minuteOfDay === 0 && end.dayOfWeek !== start.dayOfWeek ? 24 * 60 : end.minuteOfDay;
  if (end.minuteOfDay !== 0 && end.dayOfWeek !== start.dayOfWeek) {
    return false;
  }

  return windows.some(
    (window) =>
      window.dayOfWeek === start.dayOfWeek &&
      start.minuteOfDay >= window.startMinute &&
      endMinuteOfDay <= window.endMinute,
  );
}
