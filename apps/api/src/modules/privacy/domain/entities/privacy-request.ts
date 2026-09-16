import { v7 as uuidv7 } from 'uuid';

export const PRIVACY_REQUEST_TYPE = {
  DATA_EXPORT: 'DATA_EXPORT',
  DATA_DELETION: 'DATA_DELETION',
} as const;

export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPE)[keyof typeof PRIVACY_REQUEST_TYPE];

export const PRIVACY_REQUEST_STATUS = {
  REQUESTED: 'REQUESTED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;

export type PrivacyRequestStatus =
  (typeof PRIVACY_REQUEST_STATUS)[keyof typeof PRIVACY_REQUEST_STATUS];

/** Motivo, em código estável (não texto livre), pelo qual uma DATA_DELETION foi rejeitada. */
export const DELETION_REJECTION_REASON = {
  ACTIVE_ORDERS: 'ACTIVE_ORDERS',
  ACTIVE_CUSTODY: 'ACTIVE_CUSTODY',
  ACTIVE_SERVICE_REQUEST: 'ACTIVE_SERVICE_REQUEST',
} as const;

export type DeletionRejectionReason =
  (typeof DELETION_REJECTION_REASON)[keyof typeof DELETION_REJECTION_REASON];

export interface PrivacyRequestResultSummary {
  /** Contagens não-sensíveis (nunca PII) do que foi exportado/anonimizado — auditabilidade sem duplicar dado em repouso. */
  [key: string]: number;
}

interface PrivacyRequestProps {
  id: string;
  identityId: string;
  type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  requestedAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  rejectionReason: DeletionRejectionReason | null;
  resultSummary: PrivacyRequestResultSummary | null;
}

/**
 * IP-021 — solicitação de acesso/exclusão de dados (DATA_EXPORT |
 * DATA_DELETION). REQUESTED -> PROCESSING -> COMPLETED|REJECTED. Esta IP
 * processa cada solicitação de forma síncrona (dentro da mesma requisição
 * HTTP/transação) — o volume de dados por Identity neste MVP é pequeno o
 * suficiente para isso ser seguro, e evita construir uma fila/job assíncrono
 * só para uma fundação (Shared Standards §1 "minimum safe design").
 */
export class PrivacyRequest {
  private constructor(private readonly props: PrivacyRequestProps) {}

  static createNew(identityId: string, type: PrivacyRequestType, now = new Date()): PrivacyRequest {
    return new PrivacyRequest({
      id: uuidv7(),
      identityId,
      type,
      status: PRIVACY_REQUEST_STATUS.REQUESTED,
      requestedAt: now,
      processedAt: null,
      completedAt: null,
      rejectionReason: null,
      resultSummary: null,
    });
  }

  static restore(props: PrivacyRequestProps): PrivacyRequest {
    return new PrivacyRequest(props);
  }

  get id(): string {
    return this.props.id;
  }

  get identityId(): string {
    return this.props.identityId;
  }

  get type(): PrivacyRequestType {
    return this.props.type;
  }

  get status(): PrivacyRequestStatus {
    return this.props.status;
  }

  get requestedAt(): Date {
    return this.props.requestedAt;
  }

  get processedAt(): Date | null {
    return this.props.processedAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get rejectionReason(): DeletionRejectionReason | null {
    return this.props.rejectionReason;
  }

  get resultSummary(): PrivacyRequestResultSummary | null {
    return this.props.resultSummary;
  }

  markProcessing(now = new Date()): void {
    this.props.status = PRIVACY_REQUEST_STATUS.PROCESSING;
    this.props.processedAt = now;
  }

  complete(resultSummary: PrivacyRequestResultSummary, now = new Date()): void {
    this.props.status = PRIVACY_REQUEST_STATUS.COMPLETED;
    this.props.completedAt = now;
    this.props.resultSummary = resultSummary;
  }

  reject(reason: DeletionRejectionReason, now = new Date()): void {
    this.props.status = PRIVACY_REQUEST_STATUS.REJECTED;
    this.props.completedAt = now;
    this.props.rejectionReason = reason;
  }
}
