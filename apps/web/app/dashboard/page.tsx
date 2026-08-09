'use client';

import { AppShell, useIdentity } from '../../components/app-shell';
import { Icon } from '../../components/ui';

function DashboardContent() {
  const identity = useIdentity();
  const firstName = identity?.fullName.split(/\s+/)[0] ?? '';
  const emailVerified = identity?.status === 'ACTIVE';

  const steps = [
    { label: 'Confirmar e-mail', done: emailVerified, description: null },
    {
      label: 'Completar seu Trust Passport',
      done: false,
      description: 'Adicione informações básicas ao seu perfil.',
    },
    {
      label: 'Enviar sua primeira verificação',
      done: false,
      description: 'Valide seus documentos essenciais.',
    },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h1 className="headline-lg text-on-surface">Olá, {firstName}</h1>
        <p className="body-lg mt-1 text-on-surface-variant">
          Acompanhe a evolução da sua confiança
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* Trust Score */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-ambient">
          <h3 className="label-bold absolute left-4 top-4 uppercase text-on-surface">Trust Score</h3>
          <div className="relative mt-6 flex h-32 w-32 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#E2E8F0" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#c4c5d7"
                strokeWidth="8"
                strokeDasharray="283"
                strokeDashoffset="283"
              />
            </svg>
            <span className="absolute text-4xl font-bold text-outline-variant">0</span>
          </div>
          <div className="mt-4 rounded-full border border-outline-variant bg-surface-container px-3 py-1">
            <span className="label-bold text-on-surface-variant">NÃO VERIFICADO</span>
          </div>
        </div>

        {/* Verificações */}
        <div className="flex flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-ambient">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Icon name="fact_check" size={22} />
              <h3 className="label-bold uppercase">Verificações</h3>
            </div>
            <p className="headline-md mt-4 text-on-surface">
              0 <span className="text-lg font-normal text-on-surface-variant">concluídas</span>
            </p>
          </div>
          <button
            type="button"
            disabled
            className="btn-text mt-6 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-primary-container py-3 text-on-primary opacity-60"
            title="Disponível quando o módulo de Verificações for lançado"
          >
            <span>Iniciar verificação</span>
            <Icon name="arrow_forward" size={18} />
          </button>
        </div>

        {/* Perfil */}
        <div className="flex flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-ambient">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Icon name="person" size={22} />
              <h3 className="label-bold uppercase">Perfil</h3>
            </div>
            <div className="mt-6">
              <div className="mb-2 flex justify-between">
                <span className="label-bold text-on-surface-variant">PROGRESSO</span>
                <span className="label-bold text-primary">{emailVerified ? '40%' : '20%'} completo</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-primary-container"
                  style={{ width: emailVerified ? '40%' : '20%' }}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled
            className="btn-text mt-6 w-full cursor-not-allowed rounded-xl border border-outline-variant bg-transparent py-3 text-on-background opacity-60"
            title="Disponível quando o Trust Passport for lançado"
          >
            Completar perfil
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Próximos passos */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-ambient">
            <div className="border-b border-outline-variant bg-surface-bright p-6">
              <h3 className="headline-md text-lg text-on-surface">Próximos passos</h3>
              <p className="body-sm text-on-surface-variant">
                Complete estas ações para aumentar seu Trust Score.
              </p>
            </div>
            <div>
              {steps.map((step, index) => (
                <div
                  key={step.label}
                  className={`flex items-start gap-4 p-4 ${
                    index < steps.length - 1 ? 'border-b border-outline-variant/50' : ''
                  } ${step.done ? 'bg-surface-container/30' : ''}`}
                >
                  <Icon
                    name={step.done ? 'check_circle' : 'radio_button_unchecked'}
                    filled={step.done}
                    className={step.done ? 'mt-0.5 text-teal' : 'mt-0.5 text-outline-variant'}
                    size={22}
                  />
                  <div>
                    <p
                      className={`body-lg text-on-surface ${
                        step.done ? 'line-through opacity-70' : 'font-semibold'
                      }`}
                    >
                      {step.label}
                    </p>
                    {step.description ? (
                      <p className="body-sm mt-1 text-on-surface-variant">{step.description}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Atividade recente */}
        <div className="lg:col-span-1">
          <div className="flex h-full flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-ambient">
            <div className="border-b border-outline-variant p-6">
              <h3 className="headline-md text-lg text-on-surface">Atividade recente</h3>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center bg-surface-container/20 p-8 text-center">
              <div className="mb-4 flex h-32 w-32 items-center justify-center rounded-full bg-surface-container">
                <Icon name="history" className="text-outline-variant opacity-50" size={48} />
              </div>
              <p className="body-lg font-medium text-on-surface">Nenhuma atividade ainda</p>
              <p className="body-sm mt-2 max-w-[200px] text-on-surface-variant">
                Suas verificações e atualizações aparecerão aqui.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
