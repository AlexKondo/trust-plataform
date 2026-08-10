'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, Loading, Pill, ScoreRing, TrustLevelBadge } from '../../../components/layout';
import { BrandMark, Icon } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { formatDate } from '../../../lib/labels';
import type { TrustProfile } from '../../../lib/types';

/**
 * Perfil público via link compartilhável (TRS-015/017/018).
 * Página aberta: sem sessão, sem AppShell — é o que o cliente recebe por
 * WhatsApp antes de contratar alguém.
 */
export default function PublicProfilePage() {
  const params = useParams<{ token: string }>();
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'gone' | 'invalid'>('loading');
  const [authentic, setAuthentic] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<TrustProfile>(`/public/trust-profile/${params.token}`);
        setProfile(data);
        setState('ok');
        const check = await api<{ authentic: boolean }>(
          `/public/trust-profile/${params.token}/verify`,
        ).catch(() => ({ authentic: false }));
        setAuthentic(check.authentic);
      } catch (error) {
        setState(error instanceof ApiError && error.status === 410 ? 'gone' : 'invalid');
      }
    })();
  }, [params.token]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-background p-5 md:p-10">
      <div className="mb-8 mt-4">
        <BrandMark />
      </div>

      <main className="w-full max-w-lg">
        {state === 'loading' ? (
          <Card>
            <Loading label="Verificando o link..." />
          </Card>
        ) : state === 'gone' ? (
          <Card>
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Icon name="link_off" className="text-error" size={40} />
              <p className="headline-md text-on-surface">Este link não é mais válido</p>
              <p className="body-sm text-on-surface-variant">
                O dono do perfil revogou o compartilhamento ou o prazo expirou.
              </p>
            </div>
          </Card>
        ) : state === 'invalid' || !profile ? (
          <Card>
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Icon name="gpp_bad" className="text-error" size={40} />
              <p className="headline-md text-on-surface">Perfil não encontrado</p>
              <p className="body-sm text-on-surface-variant">
                Confira o link — ele pode ter sido digitado incorretamente.
              </p>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            <Card>
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed text-primary">
                  <span className="headline-md">
                    {profile.displayName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <h1 className="headline-lg text-on-surface">{profile.displayName}</h1>
                  <p className="body-sm text-on-surface-variant">
                    Na Trust Platform desde {formatDate(profile.memberSince)}
                  </p>
                </div>

                {profile.score !== null && profile.level ? (
                  <ScoreRing score={profile.score} level={profile.level} />
                ) : null}
                {profile.level ? <TrustLevelBadge level={profile.level} /> : null}

                {authentic ? (
                  <div className="flex items-center gap-2 rounded-full bg-secondary-container px-4 py-2">
                    <Icon name="verified_user" filled className="text-teal" size={18} />
                    <span className="body-sm font-medium text-on-secondary-container">
                      Perfil autêntico, emitido pela Trust Platform
                    </span>
                  </div>
                ) : null}
              </div>
            </Card>

            {profile.verifications ? (
              <Card>
                <h2 className="label-bold mb-3 uppercase text-on-surface">O que foi verificado</h2>
                <ul className="flex flex-col gap-2">
                  {[
                    { key: 'documentVerified', label: 'Documento de identidade' },
                    { key: 'addressVerified', label: 'Endereço' },
                    { key: 'phoneVerified', label: 'Telefone' },
                    { key: 'emailVerified', label: 'E-mail' },
                  ].map((row) => {
                    const ok = (profile.verifications as Record<string, boolean>)[row.key];
                    return (
                      <li key={row.key} className="flex items-center gap-2">
                        <Icon
                          name={ok ? 'check_circle' : 'radio_button_unchecked'}
                          filled={ok}
                          size={18}
                          className={ok ? 'text-teal' : 'text-outline-variant'}
                        />
                        <span
                          className={`body-sm ${ok ? 'text-on-surface' : 'text-on-surface-variant'}`}
                        >
                          {row.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            {profile.badges && profile.badges.length > 0 ? (
              <Card>
                <h2 className="label-bold mb-3 uppercase text-on-surface">Selos</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.badges.map((badge) => (
                    <Pill key={badge.code} tone="success" icon="workspace_premium">
                      {badge.name}
                    </Pill>
                  ))}
                </div>
              </Card>
            ) : null}

            <p className="body-sm text-center text-on-surface-variant">
              Este perfil foi compartilhado pelo próprio titular. A Trust Platform confirma apenas o
              que está marcado como verificado.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
