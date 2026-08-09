# Prompts para o Google Stitch — Telas do MVP (Módulo 1)

> Como usar: no [stitch.withgoogle.com](https://stitch.withgoogle.com), crie um projeto e, para **cada tela**,
> cole o **BLOCO DE ESTILO** + o **prompt da tela**. Os prompts estão em inglês (o Stitch entende melhor),
> mas os textos que aparecem NA TELA estão especificados em português.
> Quando gostar do resultado, exporte o código/HTML (ou tire screenshot) e me traga — eu implemento no app real.
> Direção visual derivada do Trust Design System (Founder Book, Documento 8): confiança, clareza, modernidade, acolhimento.

---

## BLOCO DE ESTILO (cole no início de todos os prompts)

```
Design system: modern, clean, trustworthy fintech-like web app called "Trust Platform".
Primary color: deep blue (#1D4ED8) with a subtle teal accent (#0D9488). Background: white with very light gray sections (#F8FAFC). Text: near-black (#0F172A).
Typography: Inter or similar geometric sans-serif; generous white space; 12px rounded corners; soft subtle shadows; NO gradients, NO decorative clutter.
Layout: centered card (max 440px) on a clean background with the "Trust Platform" wordmark and a small shield-check logo at top.
All on-screen text in Brazilian Portuguese. Desktop web, responsive-friendly. Accessible contrast (WCAG AA). Primary buttons: solid deep blue, full width inside forms.
```

---

## Tela 0 — Landing Page (`/` — página pública)

> Dica: para esta tela, no Stitch, peça uma página **completa com rolagem** (não é um card centralizado).
> O bloco de estilo vale, exceto o layout de card — a landing usa seções de largura total.

```
Public marketing landing page for "Trust Platform" — the digital trust layer for the local services economy.
Full-width scrolling page, NOT a centered card. Clean, professional, trustworthy; lots of white space.

Sticky top navbar: shield-check logo + "Trust Platform" wordmark on the left; links "Como funciona", "Para profissionais", "Para clientes"; on the right a ghost button "Entrar" and a primary deep-blue button "Criar conta".

Hero section: headline "Confiança que abre portas." with subheadline "A Trust Platform transforma sua reputação em um ativo real: um passaporte digital de confiança para contratar e ser contratado com segurança." Primary CTA "Criar conta gratuita" + secondary link "Ver como funciona". On the right side of the hero, a mockup of a Trust Passport card component: avatar, name "Maria Silva", tag "Verificada", a circular Trust Score indicator showing "742 — GOLD", and 3 small verification badges (identity, phone, address).

Section "Como funciona" with 3 steps in cards, each with an icon: 1. "Crie sua identidade" — "Cadastre-se e confirme seus dados."; 2. "Verifique e evolua" — "Envie verificações e construa seu Trust Score."; 3. "Contrate e trabalhe com confiança" — "Use sua reputação no marketplace de serviços."

Section with two audience cards side by side: "Para profissionais" — "Sua reputação vira credencial: conquiste clientes com um perfil verificado." and "Para clientes" — "Contrate com tranquilidade: veja score, verificações e histórico real."

Trust indicators strip: 4 small items with icons: "Verificações auditáveis", "Score explicável", "Dados protegidos", "Você controla o que compartilha".

Final CTA section on a light gray background: "Comece a construir sua confiança hoje." with primary button "Criar conta gratuita".

Footer: logo, short description, columns with links "Produto", "Empresa", "Legal" (Termos de Uso, Política de Privacidade), and copyright "© 2026 Trust Platform".
```

## Tela 1 — Cadastro (`/register`)

```
Registration page for Trust Platform.
Centered card titled "Criar sua conta" with subtitle "Comece a construir sua reputação digital".
Form fields (labels above inputs): "Nome completo", "E-mail", "Senha", "Confirmar senha".
Below the password field: a live password-requirements checklist with small check icons: "Mínimo de 12 caracteres", "Uma letra maiúscula e uma minúscula", "Um número", "Um caractere especial".
A checkbox: "Li e aceito os Termos de Uso e a Política de Privacidade" (links underlined).
Primary button: "Criar conta". Below: divider and text "Já tem uma conta?" with link "Entrar".
Show also an error state variant of the email field with message "Este e-mail já está cadastrado."
```

## Tela 2 — Login (`/login`)

```
Login page for Trust Platform.
Centered card titled "Bem-vindo(a) de volta" with subtitle "Entre para acessar sua conta".
Fields: "E-mail" and "Senha" (with show/hide password eye icon).
Right-aligned small link under password: "Esqueci minha senha".
Primary button: "Entrar" (show a loading spinner variant of this button).
Below: "Não tem uma conta?" with link "Criar conta".
Also show an inline error banner variant (light red background, rounded) with text "E-mail ou senha inválidos." and a warning variant "Conta bloqueada temporariamente por tentativas incorretas. Tente novamente em alguns minutos."
```

## Tela 3 — Verifique seu e-mail (`/verify-email` — aviso pós-cadastro)

```
Post-registration confirmation page for Trust Platform.
Centered card with a large friendly illustration of an envelope with a check mark.
Title: "Confirme seu e-mail". Text: "Enviamos um link de confirmação para maria@email.com. O link vale por 24 horas."
Secondary outlined button: "Reenviar e-mail" (show also a disabled variant with countdown text "Reenviar em 45s").
Small muted text: "Não encontrou? Verifique sua caixa de spam."
```

## Tela 4 — Verificação de e-mail: sucesso e erro (`/verify-email/success` e `/verify-email/error`)

```
Two variants of an email verification result page for Trust Platform.
Variant A (success): centered card, big teal circular check icon, title "E-mail confirmado!", text "Sua conta está ativa. Faça login para começar.", primary button "Ir para o login".
Variant B (error): centered card, amber warning icon, title "Link inválido ou expirado", text "Este link de confirmação não é mais válido. Solicite um novo para continuar.", primary button "Reenviar e-mail de confirmação", secondary link "Voltar ao login".
Also include a loading variant: centered spinner with text "Validando seu link...".
```

## Tela 5 — Esqueci minha senha (`/forgot-password`)

```
Forgot password page for Trust Platform.
Centered card titled "Recuperar senha" with subtitle "Informe seu e-mail e enviaremos as instruções".
Single field: "E-mail". Primary button: "Enviar instruções".
Link below: "Voltar ao login".
Also show the submitted state: the form is replaced by a calm confirmation with a paper-plane icon and text "Se existir uma conta para este e-mail, as instruções de recuperação foram enviadas. O link vale por 30 minutos." — never revealing whether the account exists.
```

## Tela 6 — Redefinir senha (`/reset-password`)

```
Reset password page for Trust Platform (opened from an email link).
Centered card titled "Definir nova senha".
Fields: "Nova senha" and "Confirmar nova senha" (show/hide icons), with the same live password-requirements checklist: "Mínimo de 12 caracteres", "Uma letra maiúscula e uma minúscula", "Um número", "Um caractere especial".
Primary button: "Redefinir senha".
Info note (light blue background, shield icon): "Por segurança, todas as suas sessões serão encerradas e você precisará entrar novamente."
Also show an error variant: card with amber icon, title "Link inválido ou expirado", text "Solicite uma nova recuperação de senha.", button "Solicitar novamente".
```

## Tela 7 — Alterar senha (`/settings/security/change-password`)

```
Change password page inside the logged-in settings area of Trust Platform.
Left sidebar (narrow) with the Trust Platform logo and menu items with icons: "Início", "Trust Passport", "Verificações", "Marketplace", and at the bottom "Configurações" (active state on "Configurações" > "Segurança").
Main content: page title "Segurança" with tab or section "Alterar senha".
Form card with fields: "Senha atual", "Nova senha", "Confirmar nova senha", plus the password-requirements checklist.
Primary button: "Salvar nova senha".
Info note: "Suas outras sessões serão encerradas. Esta sessão permanecerá ativa."
Show a success toast variant: "Senha alterada com sucesso."
```

## Tela 8 — Workspace / Dashboard inicial (pós-login) — para o futuro próximo

```
Home dashboard (workspace) of Trust Platform after login.
Top bar: Trust Platform wordmark on the left; on the right a bell icon and a user avatar menu with the name "Maria Silva".
Left sidebar menu with icons: "Início" (active), "Trust Passport", "Verificações", "Marketplace", "Configurações".
Main area: greeting "Olá, Maria" and subtitle "Acompanhe a evolução da sua confiança".
Row of 3 summary cards: "Trust Score" (large number 0 with level tag "NÃO VERIFICADO" in gray and a circular progress ring), "Verificações" (text "0 concluídas" with button "Iniciar verificação"), "Perfil" (progress bar "40% completo" with link "Completar perfil").
Below: a "Próximos passos" checklist card with items: "Confirmar e-mail" (checked, teal), "Completar seu Trust Passport" (unchecked), "Enviar sua primeira verificação" (unchecked).
Empty-state section "Atividade recente" with muted illustration and text "Nenhuma atividade ainda".
```

---

### Dicas finais

- Gere **uma tela por vez** e itere no chat do Stitch ("make the card narrower", "increase spacing" etc.).
- Peça sempre as **variantes de estado** (erro, loading, sucesso) — elas já estão descritas nos prompts.
- Quando aprovar, use **Export/Copy code** (ou screenshots) e me envie — eu transformo em páginas reais no `apps/web`, conectadas às APIs que já existem.
