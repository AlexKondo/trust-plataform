import { PartnerAvailabilityWindow } from '../../domain/entities/partner-availability';
import { PartnerAvailabilityWindowResponse } from '../dto/partner-availability.dtos';

export function toAvailabilityWindowResponse(
  window: PartnerAvailabilityWindow,
): PartnerAvailabilityWindowResponse {
  return {
    windowId: window.id,
    dayOfWeek: window.dayOfWeek,
    startMinute: window.startMinute,
    endMinute: window.endMinute,
    timezone: window.timezone,
  };
}
