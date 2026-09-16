import { describe, expect, it } from 'vitest';
import {
  DELETION_REJECTION_REASON,
  PRIVACY_REQUEST_STATUS,
  PRIVACY_REQUEST_TYPE,
  PrivacyRequest,
} from './privacy-request';

describe('PrivacyRequest (IP-021)', () => {
  it('nasce REQUESTED', () => {
    const request = PrivacyRequest.createNew('identity-1', PRIVACY_REQUEST_TYPE.DATA_EXPORT);
    expect(request.status).toBe(PRIVACY_REQUEST_STATUS.REQUESTED);
    expect(request.identityId).toBe('identity-1');
    expect(request.completedAt).toBeNull();
  });

  it('markProcessing → PROCESSING, com processedAt', () => {
    const request = PrivacyRequest.createNew('identity-1', PRIVACY_REQUEST_TYPE.DATA_DELETION);
    const now = new Date();
    request.markProcessing(now);
    expect(request.status).toBe(PRIVACY_REQUEST_STATUS.PROCESSING);
    expect(request.processedAt).toEqual(now);
  });

  it('complete → COMPLETED, com resultSummary e completedAt', () => {
    const request = PrivacyRequest.createNew('identity-1', PRIVACY_REQUEST_TYPE.DATA_EXPORT);
    const now = new Date();
    request.complete({ orders: 2 }, now);
    expect(request.status).toBe(PRIVACY_REQUEST_STATUS.COMPLETED);
    expect(request.completedAt).toEqual(now);
    expect(request.resultSummary).toEqual({ orders: 2 });
    expect(request.rejectionReason).toBeNull();
  });

  it('reject → REJECTED, com rejectionReason e completedAt (nunca chega a PROCESSING/anonimiza nada)', () => {
    const request = PrivacyRequest.createNew('identity-1', PRIVACY_REQUEST_TYPE.DATA_DELETION);
    const now = new Date();
    request.reject(DELETION_REJECTION_REASON.ACTIVE_ORDERS, now);
    expect(request.status).toBe(PRIVACY_REQUEST_STATUS.REJECTED);
    expect(request.rejectionReason).toBe(DELETION_REJECTION_REASON.ACTIVE_ORDERS);
    expect(request.completedAt).toEqual(now);
    expect(request.resultSummary).toBeNull();
  });
});
