import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { LocaleProvider } from '../lib/i18n/LocaleProvider';
import { ServiceWorkerRegistration } from '../components/service-worker-registration';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Trust Platform',
  description:
    'A camada de confiança digital para a economia de serviços locais. Transforme sua reputação em um ativo real.',
  // IP-022 — instalabilidade PWA (Partner/Member em campo, tela adicionada ao início).
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Trust Platform',
  },
};

// IP-022 — width=device-width evita zoom forçado em telas de 375–428px e mantém o
// tds-input em 16px (Safari não dá zoom automático em foco de input >=16px).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0037b0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={inter.className}>
        <ServiceWorkerRegistration />
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
