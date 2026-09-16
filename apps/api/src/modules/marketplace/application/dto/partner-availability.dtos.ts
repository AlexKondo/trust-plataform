import { z } from 'zod';

/** IP-005 — uma janela semanal de disponibilidade. */
export const availabilityWindowInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  timezone: z.string().trim().min(3).max(50).default('America/Sao_Paulo'),
});
export type AvailabilityWindowInput = z.infer<typeof availabilityWindowInputSchema>;

/** Substitui o conjunto inteiro de janelas do Partner (replace-all, não patch). */
export const setPartnerAvailabilityRequestSchema = z.object({
  windows: z.array(availabilityWindowInputSchema).max(30),
});
export type SetPartnerAvailabilityRequest = z.infer<typeof setPartnerAvailabilityRequestSchema>;

export interface PartnerAvailabilityWindowResponse {
  windowId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
}
