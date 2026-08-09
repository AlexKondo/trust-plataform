'use client';

import Link from 'next/link';
import { useState } from 'react';

export function Icon({
  name,
  className = '',
  filled = false,
  size,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  );
}

export function BrandMark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/10 text-teal">
        <Icon name="verified_user" size={28} />
      </div>
      <span className="headline-lg text-primary">Trust Platform</span>
    </Link>
  );
}

/** Card central de 440px dos fluxos de auth (DESIGN.md). */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5 md:p-8">
      <main className="w-full max-w-[440px]">
        <div className="flex flex-col gap-8 rounded-xl bg-surface-container-lowest p-8 shadow-ambient">
          <BrandMark />
          {children}
        </div>
      </main>
    </div>
  );
}

export function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center">
      <h2 className="headline-md text-on-surface">{title}</h2>
      {subtitle ? <p className="body-lg mt-2 text-on-surface-variant">{subtitle}</p> : null}
    </div>
  );
}

export function Banner({
  kind,
  icon,
  children,
}: {
  kind: 'error' | 'warning' | 'info' | 'success';
  icon?: string;
  children: React.ReactNode;
}) {
  const styles = {
    error: 'bg-error-container text-on-error-container',
    warning: 'bg-tertiary-fixed text-on-tertiary-container',
    info: 'bg-primary-fixed text-primary',
    success: 'bg-secondary-container text-on-secondary-container',
  }[kind];
  const defaultIcon = { error: 'error', warning: 'warning', info: 'shield', success: 'check_circle' }[
    kind
  ];
  return (
    <div className={`flex items-start gap-3 rounded-lg p-4 ${styles}`}>
      <Icon name={icon ?? defaultIcon} className="mt-0.5" size={20} />
      <p className="body-sm">{children}</p>
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="label-bold text-on-surface" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? <p className="body-sm text-error">{error}</p> : null}
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder = '••••••••',
  autoComplete = 'new-password',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        className="tds-input pr-12"
        type={visible ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-on-surface"
        onClick={() => setVisible((current) => !current)}
      >
        <Icon name={visible ? 'visibility_off' : 'visibility'} size={22} />
      </button>
    </div>
  );
}

const PASSWORD_RULES: Array<{ label: string; test: (password: string) => boolean }> = [
  { label: 'Mínimo de 12 caracteres', test: (p) => p.length >= 12 },
  { label: 'Uma letra maiúscula e uma minúscula', test: (p) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { label: 'Um número', test: (p) => /[0-9]/.test(p) },
  { label: 'Um caractere especial', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="mt-1 flex flex-col gap-1.5">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className="flex items-center gap-2">
            <Icon
              name={ok ? 'check_circle' : 'radio_button_unchecked'}
              filled={ok}
              size={16}
              className={ok ? 'text-teal' : 'text-outline-variant'}
            />
            <span className={`body-sm ${ok ? 'text-on-surface' : 'text-on-surface-variant'}`}>
              {rule.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export function PrimaryButton({
  children,
  loading = false,
  loadingLabel,
  disabled = false,
  type = 'submit',
  onClick,
}: {
  children: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className="btn-text flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 py-3 text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <>
          <Icon name="progress_activity" className="spinner" size={20} />
          <span>{loadingLabel ?? 'Aguarde...'}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'submit' | 'button';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="btn-text flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant bg-transparent px-4 py-3 text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
