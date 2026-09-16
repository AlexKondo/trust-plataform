import { z } from 'zod';

/**
 * IP-020 — janela de tempo aceita por todo endpoint de série temporal.
 * Default: últimos 30 dias (inclusive `from`, exclusivo `to`) quando omitidos
 * — a mesma janela "mês corrente operacional" que um painel de ops abre por
 * padrão. `from` deve ser estritamente anterior a `to` (validado pelo
 * `.refine()` abaixo — 400 determinístico via `ZodValidationPipe`, nunca uma
 * query com janela invertida chegando ao banco).
 */
export const dateRangeQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from < value.to, {
    message: 'from must be earlier than to',
    path: ['from'],
  });
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const cohortQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});
export type CohortQuery = z.infer<typeof cohortQuerySchema>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Resolve a janela efetiva, aplicando o default de 30 dias e validando a ordem. */
export function resolveDateRange(query: DateRangeQuery): { from: Date; to: Date } {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - THIRTY_DAYS_MS);
  return { from, to };
}
