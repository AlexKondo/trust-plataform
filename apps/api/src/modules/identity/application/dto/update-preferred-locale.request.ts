import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../../../../shared/i18n/locale';

/** IP-002 — `PATCH /identities/me/locale`. Só aceita locales do catálogo suportado. */
export const updatePreferredLocaleRequestSchema = z.object({
  preferredLocale: z.enum(SUPPORTED_LOCALES, {
    errorMap: () => ({
      message: `preferredLocale must be one of: ${SUPPORTED_LOCALES.join(', ')}`,
    }),
  }),
});

export type UpdatePreferredLocaleRequest = z.infer<typeof updatePreferredLocaleRequestSchema>;

export interface UpdatePreferredLocaleResponse {
  identityId: string;
  preferredLocale: string;
  updatedAt: string;
}
