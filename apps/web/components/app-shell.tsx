'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { ApiError, CurrentIdentity, authApi, logout, tokenStore } from '../lib/api';
import { Icon } from './ui';

const MENU = [
  { href: '/dashboard', icon: 'home', label: 'Início' },
  { href: '/trust-score', icon: 'shield', label: 'Trust Score' },
  { href: '/trust-passport', icon: 'badge', label: 'Trust Passport' },
  { href: '/verifications', icon: 'fact_check', label: 'Verificações' },
  { href: '/marketplace', icon: 'storefront', label: 'Marketplace' },
  { href: '/conversations', icon: 'forum', label: 'Conversas' },
  { href: '/orders', icon: 'receipt_long', label: 'Pedidos' },
];

const IdentityContext = createContext<CurrentIdentity | null>(null);
export const useIdentity = () => useContext(IdentityContext);

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [identity, setIdentity] = useState<CurrentIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    authApi<CurrentIdentity>('/identities/me')
      .then((data) => setIdentity(data))
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          tokenStore.clear();
          router.replace('/login');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Icon name="progress_activity" className="spinner text-primary" size={40} />
      </div>
    );
  }

  const inSettings = pathname.startsWith('/settings');

  return (
    <IdentityContext.Provider value={identity}>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar */}
        <aside className="hidden w-64 flex-col border-r border-outline-variant bg-surface-container-lowest p-6 md:flex">
          <Link href="/dashboard" className="mb-10 flex items-center gap-2">
            <Icon name="verified_user" filled className="text-teal" size={24} />
            <span className="headline-md text-lg font-bold text-primary">Trust Platform</span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            {MENU.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`body-sm flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors ${
                    active
                      ? 'bg-primary-fixed text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  <Icon name={item.icon} size={20} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {identity?.isAdmin ? (
            <Link
              href="/admin"
              className={`body-sm mb-1 flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-tertiary-fixed text-on-tertiary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              <Icon name="admin_panel_settings" size={20} />
              Moderação
            </Link>
          ) : null}
          <Link
            href="/settings"
            className={`body-sm flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors ${
              inSettings
                ? 'bg-primary-fixed text-primary'
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <Icon name="settings" size={20} />
            Configurações
          </Link>
        </aside>

        {/* Main */}
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-6 py-4">
            <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
              <Icon name="verified_user" filled className="text-teal" size={22} />
              <span className="font-bold text-primary">Trust Platform</span>
            </Link>
            <div className="hidden md:block" />
            <div className="flex items-center gap-4">
              <button
                type="button"
                aria-label="Notificações"
                className="text-on-surface-variant transition-colors hover:text-on-surface"
              >
                <Icon name="notifications" size={22} />
              </button>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-fixed text-primary">
                  <span className="label-bold">
                    {identity?.fullName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase() ?? '?'}
                  </span>
                </div>
                <span className="body-sm hidden font-medium text-on-surface md:block">
                  {identity?.fullName}
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="body-sm text-on-surface-variant transition-colors hover:text-error"
                  title="Sair"
                >
                  <Icon name="logout" size={20} />
                </button>
              </div>
            </div>
          </header>
          <main className="flex-1 p-6 md:p-10">{children}</main>
        </div>
      </div>
    </IdentityContext.Provider>
  );
}
