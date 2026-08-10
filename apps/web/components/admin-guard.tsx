'use client';

import { useIdentity } from './app-shell';
import { Card, ErrorState } from './layout';

/**
 * Bloqueio de tela para as rotas de moderação. É conveniência de navegação:
 * a autorização real é do `AdminGuard` da API, que recusa qualquer chamada de
 * quem não é admin — esconder o botão nunca é a proteção.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const identity = useIdentity();

  if (identity && !identity.isAdmin) {
    return (
      <Card>
        <ErrorState message="Esta área é restrita à equipe de moderação da plataforma." />
      </Card>
    );
  }
  return <>{children}</>;
}
