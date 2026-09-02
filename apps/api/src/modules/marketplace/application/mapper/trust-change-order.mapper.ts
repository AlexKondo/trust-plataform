import {
  ServiceExecutionPause,
  ServiceExecutionSession,
} from '../../domain/entities/service-execution-session';
import { TrustChangeOrder } from '../../domain/entities/trust-change-order';
import { ChangeOrderEvidenceRecord } from '../../domain/repositories/trust-change-order.repository';
import {
  ChangeOrderEvidenceResponse,
  ChangeOrderResponse,
  ExecutionPauseResponse,
  ExecutionSessionResponse,
} from '../dto/trust-change-order.dtos';

export function toChangeOrderEvidenceResponse(
  record: ChangeOrderEvidenceRecord,
): ChangeOrderEvidenceResponse {
  return {
    evidenceId: record.id,
    type: record.type,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    uploadedBy: record.uploadedBy,
    uploadedAt: record.uploadedAt.toISOString(),
  };
}

/**
 * PACK-03 §15 — `includeFinancials` decide se a economia interna do prestador
 * (base da Trust Fee, taxa, líquido) aparece. O Trust Member vê o que vai
 * pagar; quanto a plataforma retém do parceiro não é assunto dele.
 */
export function toChangeOrderResponse(
  changeOrder: TrustChangeOrder,
  evidences: ChangeOrderEvidenceRecord[],
  includeFinancials: boolean,
  now = new Date(),
): ChangeOrderResponse {
  const props = changeOrder.toProps();
  return {
    changeOrderId: props.id,
    orderId: props.orderId,
    proposedBy: props.proposedBy,
    type: props.type,
    status: changeOrder.effectiveStatus(now),
    currency: props.currency,
    additionalMinutes: props.additionalMinutes,
    serviceDeltaAmount: props.serviceDeltaAmount,
    materialCostDeltaAmount: props.materialCostDeltaAmount,
    materialMarkupDeltaAmount: props.materialMarkupDeltaAmount,
    changeGrossAmount: props.changeGrossAmount,
    ...(includeFinancials
      ? {
          trustFeeRateBps: props.trustFeeRateBps,
          changeTrustFeeBaseAmount: props.changeTrustFeeBaseAmount,
          changeTrustFeeAmount: props.changeTrustFeeAmount,
          changeProviderNetBeforePspFees: props.changeProviderNetBeforePspFees,
        }
      : {}),
    reason: props.reason,
    description: props.description,
    expiresAt: props.expiresAt?.toISOString() ?? null,
    submittedAt: props.submittedAt?.toISOString() ?? null,
    decidedAt: props.decidedAt?.toISOString() ?? null,
    decidedBy: props.decidedBy,
    decisionReason: props.decisionReason,
    evidences: evidences.map(toChangeOrderEvidenceResponse),
    createdAt: props.createdAt.toISOString(),
    updatedAt: props.updatedAt.toISOString(),
  };
}

export function toPauseResponse(pause: ServiceExecutionPause): ExecutionPauseResponse {
  return {
    pauseId: pause.id,
    reasonCode: pause.reasonCode,
    note: pause.note,
    pausedAt: pause.pausedAt.toISOString(),
    resumedAt: pause.resumedAt?.toISOString() ?? null,
    durationMinutes: pause.durationMinutes,
  };
}

export function toExecutionSessionResponse(
  session: ServiceExecutionSession,
  pauses: ServiceExecutionPause[],
  billableMinutes: number | null,
  authorizedMinutes: number | null,
): ExecutionSessionResponse {
  return {
    sessionId: session.id,
    status: session.status,
    checkInAt: session.checkInAt?.toISOString() ?? null,
    checkOutAt: session.checkOutAt?.toISOString() ?? null,
    elapsedMinutes: session.elapsedMinutes,
    pausedMinutes: session.pausedMinutes,
    rawActiveMinutes: session.rawActiveMinutes,
    billableMinutes,
    authorizedMinutes,
    pauses: pauses.map(toPauseResponse),
  };
}
