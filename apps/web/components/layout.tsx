'use client';

import Link from 'next/link';
import { LEVEL_LABEL, LEVEL_RANGE } from '../lib/labels';
import { Icon } from './ui';

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4">
      {back ? (
        <Link
          href={back.href}
          className="body-sm flex w-fit items-center gap-1 text-on-surface-variant transition-colors hover:text-primary"
        >
          <Icon name="arrow_back" size={18} />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">{title}</h1>
          {subtitle ? <p className="body-lg mt-1 text-on-surface-variant">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest shadow-ambient ${
        padded ? 'p-6' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  icon,
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-primary">
          {icon ? <Icon name={icon} size={20} /> : null}
          <h2 className="label-bold uppercase">{title}</h2>
        </div>
        {hint ? <p className="body-sm mt-1 text-on-surface-variant">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

const TONE_STYLE: Record<Tone, string> = {
  neutral: 'bg-surface-container text-on-surface-variant',
  success: 'bg-secondary-container text-on-secondary-container',
  warning: 'bg-tertiary-fixed text-on-tertiary-container',
  error: 'bg-error-container text-on-error-container',
  info: 'bg-primary-fixed text-primary',
};

export function Pill({
  children,
  tone = 'neutral',
  icon,
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: string;
}) {
  return (
    <span
      className={`label-bold inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${TONE_STYLE[tone]}`}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

/** Mapeia status de qualquer módulo para o tom visual adequado. */
export function toneForStatus(status: string): Tone {
  if (['APPROVED', 'PUBLISHED', 'COMPLETED', 'ACCEPTED', 'CLOSED', 'RESOLVED'].includes(status)) {
    return 'success';
  }
  if (['REJECTED', 'CANCELLED', 'DISPUTE_OPEN', 'EXPIRED', 'REMOVED'].includes(status)) {
    return 'error';
  }
  if (
    [
      'PENDING_REVIEW',
      'IN_REVIEW',
      'WAITING_FOR_EVIDENCE',
      'PENDING',
      'IN_PROGRESS',
      'AWAITING_CUSTOMER_CONFIRMATION',
      'OPEN',
      'RESERVED',
    ].includes(status)
  ) {
    return 'warning';
  }
  if (['SCHEDULED', 'CUSTOMER_CONFIRMED', 'DISPUTE_RESOLVED'].includes(status)) {
    return 'info';
  }
  return 'neutral';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-container">
        <Icon name={icon} className="text-outline-variant" size={36} />
      </div>
      <p className="body-lg font-medium text-on-surface">{title}</p>
      {description ? (
        <p className="body-sm max-w-sm text-on-surface-variant">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Loading({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-on-surface-variant">
      <Icon name="progress_activity" className="spinner text-primary" size={32} />
      <p className="body-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <Icon name="error" className="text-error" size={32} />
      <p className="body-lg text-on-surface">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="body-sm font-medium text-primary underline"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}

/** Selo de confiança do anunciante — o elemento visual central do produto. */
export function TrustLevelBadge({
  level,
  score,
  size = 'md',
}: {
  level: string | null;
  score?: number | null;
  size?: 'sm' | 'md';
}) {
  if (!level) {
    return null;
  }
  const tone: Tone =
    level === 'PLATINUM' || level === 'GOLD'
      ? 'success'
      : level === 'SILVER'
        ? 'info'
        : level === 'BRONZE'
          ? 'warning'
          : 'neutral';
  return (
    <span
      className={`label-bold inline-flex items-center gap-1 rounded-full ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      } ${TONE_STYLE[tone]}`}
    >
      <Icon name="verified_user" filled size={size === 'sm' ? 12 : 14} />
      {LEVEL_LABEL[level] ?? level}
      {score !== undefined && score !== null ? ` · ${score}` : ''}
    </span>
  );
}

/** Anel de progresso do Trust Score dentro da faixa do nível atual. */
export function ScoreRing({ score, level }: { score: number; level: string }) {
  const range = LEVEL_RANGE[level] ?? { min: 0, max: 1000 };
  const span = Math.max(1, range.max - range.min);
  const progress = Math.min(1, Math.max(0, (score - range.min) / span));
  const circumference = 283;

  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#E2E8F0" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#0d9488"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <span className="absolute text-4xl font-bold text-on-surface">{score}</span>
    </div>
  );
}

export function StarRating({
  value,
  onChange,
  size = 24,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          aria-label={`${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
          onClick={() => onChange?.(star)}
          className={onChange ? 'transition-transform hover:scale-110' : 'cursor-default'}
        >
          <Icon
            name="star"
            filled={star <= value}
            size={size}
            className={star <= value ? 'text-tertiary-container' : 'text-outline-variant'}
          />
        </button>
      ))}
    </div>
  );
}
