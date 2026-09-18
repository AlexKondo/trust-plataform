'use client';

import { useEffect } from 'react';

/**
 * IP-022 — registra o Service Worker mínimo (`public/sw.js`) para instalabilidade PWA e
 * shell offline-safe. Cliente-only, sem efeito nenhum em SSR; silencioso quando o browser
 * não suporta (ex.: alguns webviews) — nunca bloqueia a renderização da página.
 */
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Instalação do SW é um aprimoramento progressivo — falha aqui nunca deve
      // impedir o uso normal do app.
    });
  }, []);
  return null;
}
