import Link from 'next/link';

function Icon({
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

const STEPS = [
  {
    icon: 'person_add',
    title: 'Crie sua identidade',
    text: 'Cadastre-se e confirme seus dados.',
  },
  {
    icon: 'fact_check',
    title: 'Verifique e evolua',
    text: 'Envie verificações e construa seu Trust Score.',
  },
  {
    icon: 'handshake',
    title: 'Contrate e trabalhe com confiança',
    text: 'Use sua reputação no marketplace de serviços.',
  },
];

const TRUST_ITEMS = [
  { icon: 'verified', label: 'Verificações auditáveis' },
  { icon: 'insights', label: 'Score explicável' },
  { icon: 'lock', label: 'Dados protegidos' },
  { icon: 'tune', label: 'Você controla o que compartilha' },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Navbar */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-outline-variant/50 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Icon name="verified_user" filled className="text-teal" size={26} />
            <span className="headline-md font-bold text-primary">Trust Platform</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a className="body-sm text-on-surface-variant transition-colors hover:text-primary" href="#como-funciona">
              Como funciona
            </a>
            <a className="body-sm text-on-surface-variant transition-colors hover:text-primary" href="#para-profissionais">
              Para profissionais
            </a>
            <a className="body-sm text-on-surface-variant transition-colors hover:text-primary" href="#para-clientes">
              Para clientes
            </a>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="btn-text hidden items-center justify-center rounded-xl border border-outline-variant px-4 py-2 text-on-surface transition-colors hover:bg-surface-container-low md:inline-flex"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="btn-text inline-flex items-center justify-center rounded-xl bg-primary-container px-4 py-2 text-on-primary transition-colors hover:bg-primary"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-grow pt-24 md:pt-32">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            <div className="flex flex-col gap-8">
              <h1 className="headline-lg text-on-surface md:text-5xl md:leading-tight">
                Confiança que abre portas.
              </h1>
              <p className="body-lg text-lg text-on-surface-variant">
                A Trust Platform transforma sua reputação em um ativo real: um passaporte digital de
                confiança para contratar e ser contratado com segurança.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/register"
                  className="btn-text inline-flex items-center justify-center rounded-xl bg-primary-container px-6 py-3 text-on-primary shadow-sm transition-colors hover:bg-primary"
                >
                  Criar conta gratuita
                </Link>
                <a
                  href="#como-funciona"
                  className="btn-text inline-flex items-center justify-center rounded-xl border border-outline-variant px-6 py-3 text-on-surface transition-colors hover:bg-surface-container-low"
                >
                  Ver como funciona
                </a>
              </div>
            </div>

            {/* Trust Passport mockup */}
            <div className="relative mx-auto w-full max-w-md lg:ml-auto">
              <div className="absolute inset-0 rounded-full bg-primary-fixed opacity-30 blur-3xl" />
              <div className="relative z-10 flex flex-col items-center gap-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-ambient">
                <div className="flex w-full flex-col items-center gap-3">
                  <div className="relative">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-surface-container-lowest bg-primary-fixed shadow-sm">
                      <span className="headline-md text-primary">MS</span>
                    </div>
                    <div className="absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-white bg-teal p-1 text-white shadow-sm">
                      <Icon name="verified" filled size={16} />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="headline-md text-on-surface">Maria Silva</h3>
                    <span className="label-bold mt-1 inline-block rounded-full bg-surface-container-low px-3 py-1 uppercase tracking-wider text-on-surface-variant">
                      Verificada
                    </span>
                  </div>
                </div>
                <div className="flex w-full flex-col items-center gap-2 rounded-lg border border-outline-variant/50 bg-surface-container p-6">
                  <span className="body-sm text-on-surface-variant">Trust Score</span>
                  <div className="flex items-center gap-2">
                    <span className="headline-lg text-primary">742</span>
                    <span className="label-bold rounded bg-[#FBBF24]/20 px-2 py-1 uppercase text-[#B45309]">
                      GOLD
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-outline-variant/30">
                    <div className="h-full rounded-full bg-primary" style={{ width: '74%' }} />
                  </div>
                </div>
                <div className="flex w-full justify-between gap-2">
                  {[
                    { icon: 'badge', label: 'Identidade' },
                    { icon: 'smartphone', label: 'Telefone' },
                    { icon: 'home_pin', label: 'Endereço' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex flex-1 flex-col items-center justify-center rounded-lg border border-outline-variant bg-surface p-3"
                    >
                      <Icon name={item.icon} className="mb-1 text-primary" size={22} />
                      <span className="label-bold text-[10px] uppercase text-on-surface-variant">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="bg-surface-container-low/60 py-16 md:py-24">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <h2 className="headline-lg text-center text-on-surface">Como funciona</h2>
            <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div
                  key={step.title}
                  className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-ambient"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-fixed text-primary">
                    <Icon name={step.icon} size={26} />
                  </div>
                  <span className="label-bold uppercase text-outline">Passo {index + 1}</span>
                  <h3 className="headline-md text-lg text-on-surface">{step.title}</h3>
                  <p className="body-sm text-on-surface-variant">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Públicos */}
        <section className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div
              id="para-profissionais"
              className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-10 shadow-ambient"
            >
              <Icon name="construction" className="text-primary" size={32} />
              <h3 className="headline-md text-on-surface">Para profissionais</h3>
              <p className="body-lg text-on-surface-variant">
                Sua reputação vira credencial: conquiste clientes com um perfil verificado.
              </p>
            </div>
            <div
              id="para-clientes"
              className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-10 shadow-ambient"
            >
              <Icon name="family_home" className="text-primary" size={32} />
              <h3 className="headline-md text-on-surface">Para clientes</h3>
              <p className="body-lg text-on-surface-variant">
                Contrate com tranquilidade: veja score, verificações e histórico real.
              </p>
            </div>
          </div>

          {/* Faixa de confiança */}
          <div className="mt-16 grid grid-cols-2 gap-6 md:grid-cols-4">
            {TRUST_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <Icon name={item.icon} className="text-teal" size={24} />
                <span className="body-sm font-medium text-on-surface">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-surface-container-low py-16 md:py-20">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 text-center">
            <h2 className="headline-lg text-on-surface">Comece a construir sua confiança hoje.</h2>
            <Link
              href="/register"
              className="btn-text inline-flex items-center justify-center rounded-xl bg-primary-container px-8 py-3 text-on-primary transition-colors hover:bg-primary"
            >
              Criar conta gratuita
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto w-full border-t border-outline-variant bg-surface-container-low px-4 py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Icon name="verified_user" filled className="text-teal" size={24} />
              <span className="headline-md font-bold text-primary">Trust Platform</span>
            </div>
            <p className="body-sm text-on-surface-variant">
              A camada de confiança digital para a economia de serviços locais.
            </p>
          </div>
          {[
            { title: 'Produto', links: ['Como funciona', 'Para profissionais', 'Para clientes'] },
            { title: 'Empresa', links: ['Sobre nós', 'Carreiras', 'Contato'] },
            { title: 'Legal', links: ['Termos de Uso', 'Política de Privacidade'] },
          ].map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <h4 className="label-bold mb-2 uppercase tracking-wider text-on-surface">
                {column.title}
              </h4>
              {column.links.map((link) => (
                <a
                  key={link}
                  className="body-sm text-on-surface-variant transition-colors hover:text-primary"
                  href="#"
                >
                  {link}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="mx-auto mt-12 max-w-7xl border-t border-outline-variant/50 pt-8">
          <p className="body-sm text-on-surface-variant">
            © 2026 Trust Platform. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
