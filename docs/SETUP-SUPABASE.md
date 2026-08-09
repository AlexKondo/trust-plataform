# Setup do Supabase — Trust Platform (guia clique a clique)

> Objetivo: deixar o Supabase pronto como **banco (Postgres) + storage de arquivos**.
> Não usaremos Supabase Auth, Data API nem Realtime — o backend NestJS é o único dono do banco.
> Tempo estimado: 20–30 min (Partes A–G). A Parte H (ambiente local) é opcional agora.

---

## PARTE A — Conta e projeto

### A1. Criar a conta
1. Abra `https://supabase.com` e clique em **Start your project** (ou **Sign in** no canto superior direito).
2. Recomendado: **Continue with GitHub** (se ainda não tem conta GitHub, crie antes em `github.com` — você vai precisar dela de qualquer forma para o repositório do projeto). Alternativa: cadastro por e-mail + senha (confirme o e-mail que chegar na caixa de entrada).
3. Após o login você cai no dashboard: `supabase.com/dashboard`.

### A2. Criar a organização
1. No primeiro acesso o Supabase pede para criar uma **Organization**. Se não pedir, clique no seletor no topo esquerdo → **New organization**.
2. Preencha:
   - **Name**: `trust-platform`
   - **Type**: Company (ou Personal, tanto faz no Free)
   - **Plan**: **Free**
3. Clique em **Create organization**.

### A3. Criar o projeto de desenvolvimento
1. Dentro da organização, clique em **New project**.
2. Preencha:
   - **Project name**: `trust-dev`
   - **Database Password**: clique em **Generate a password**. ⚠️ **COPIE E GUARDE AGORA** num gerenciador de senhas (Bitwarden, 1Password…). Essa senha é a do Postgres; o Supabase não mostra de novo (dá para resetar depois, mas invalida as connection strings).
   - **Region**: **South America (São Paulo)** — `sa-east-1`
3. Clique em **Create new project** e aguarde ~2 minutos (status "Setting up project…" até virar o dashboard do projeto).

> 💡 Produção: quando formos lançar, repita a A3 criando `trust-prod` (aí sim no plano **Pro**). Por enquanto, só o `trust-dev`.

---

## PARTE B — Desligar o que não vamos usar

### B1. Desabilitar a Data API (acesso REST direto às tabelas)
1. Menu lateral esquerdo (ícone de engrenagem, embaixo) → **Project Settings**.
2. Na lista de configurações, clique em **Data API** (pode aparecer dentro de "API").
3. Desligue o toggle **Enable Data API** → **Save**.
4. Se o seu painel não tiver esse toggle: alternativa equivalente é nunca criar policies de RLS públicas e não distribuir a `anon key` — mas o toggle existe nos projetos novos; procure por "Data API".

### B2. Desabilitar o Auth
1. Menu lateral → **Authentication**.
2. Abra **Sign In / Providers** (ou "Providers").
3. Clique em **Email** → desligue **Enable Email provider** → **Save**.
4. Ainda em Authentication, procure a opção geral **Allow new users to sign up** (em "Settings"/"General") e desligue também.

### B3. Realtime
Nada a fazer: o Realtime é opt-in por tabela e nunca vamos ativá-lo. Só não ative "Enable Realtime" ao criar tabelas.

---

## PARTE C — Connection strings (as duas que importam)

1. No topo do dashboard do projeto, clique no botão **Connect**.
2. Abre um modal com abas/opções. Você verá três formas de conexão:

| Opção no modal | Porta | Para quê | Vamos usar? |
|---|---|---|---|
| **Direct connection** | 5432 (`db.<ref>.supabase.co`) | Conexão direta ao Postgres. **IPv6 apenas** | Migrations (se sua rede tiver IPv6) |
| **Transaction pooler** | 6543 (`...pooler.supabase.com`) | Serverless; NÃO suporta prepared statements | ❌ Não |
| **Session pooler** | 5432 (`...pooler.supabase.com`) | Conexão via pooler, funciona em IPv4, suporta prepared statements | ✅ **App + pg-boss + migrations** |

3. Copie a URI do **Session pooler**. Formato:
   ```
   postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
   - `<ref>` = o ID do projeto (aparece automaticamente)
   - Troque `[YOUR-PASSWORD]` pela senha do banco (Parte A3)
   - ⚠️ Note que o usuário do pooler é `postgres.<ref>` (com ponto), não só `postgres`
4. Copie também a URI da **Direct connection** (usaremos para migrations se possível; se sua internet/host não tiver IPv6, use a do Session pooler para tudo — funciona igual).
5. Guarde as duas no gerenciador de senhas.

> ⚠️ Se a senha tiver caracteres especiais (`@`, `#`, `%`…), eles precisam ser URL-encoded na string (ex.: `@` vira `%40`). Se quiser evitar isso, resete a senha em Project Settings → Database usando só letras+números longos.

---

## PARTE D — Chaves da API (para o Storage)

1. **Project Settings** → **API Keys** (ou "API").
2. Copie e guarde:
   - **Project URL**: `https://<ref>.supabase.co`
   - **service_role** key (clique em **Reveal** para mostrar). Nos painéis mais novos ela pode aparecer como **Secret key** (`sb_secret_...`) — é o equivalente; copie essa.
3. ⚠️ Regras da service key: só no backend, nunca no frontend, nunca no Git, nunca em screenshot. Ela ignora qualquer proteção do banco.

---

## PARTE E — Storage (evidências de verificação)

1. Menu lateral → **Storage** → **New bucket**.
2. Preencha:
   - **Name**: `verification-evidences`
   - **Public bucket**: **DESLIGADO** (privado — vai guardar documentos e selfies)
   - Se aparecer "Additional configuration": **File size limit** = `10 MB`; **Allowed MIME types** = `image/jpeg, image/png, application/pdf`
3. **Create bucket** (ou Save).
4. **Não crie nenhuma policy** de acesso. O backend acessa com a service key e gera URLs assinadas temporárias — exatamente o modelo da spec VRF-006.
5. O bucket `marketplace-media` fica para o Módulo 6 (mesmos passos).

---

## PARTE F — Arquivos de ambiente no projeto

Na raiz do repositório já existem [.env.example](../.env.example) e [.gitignore](../.gitignore). Faça:

1. Copie `.env.example` → `.env` (mesmo diretório).
2. Preencha no `.env`:
   - `DATABASE_URL` = URI do **Session pooler** (Parte C3, já com a senha)
   - `DIRECT_DATABASE_URL` = URI da **Direct connection** (ou repita a do pooler)
   - `SUPABASE_URL` = Project URL (Parte D)
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role/secret key (Parte D)
   - `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`: deixe em branco — geraremos no Módulo 0
3. Confira que `.env` está listado no `.gitignore` (está) — ele nunca pode ser commitado.

---

## PARTE G — Verificar que está tudo funcionando

1. **Testar o banco pelo dashboard**: menu lateral → **SQL Editor** → **New query** → digite `select version();` → **Run**. Deve retornar `PostgreSQL 17.x` (ou 15/16 — qualquer ≥16 atende o DOC-004).
2. **Testar timezone**: `show timezone;` → deve retornar `UTC`.
3. **Testar a connection string da sua máquina** (opcional agora; obrigatório no Módulo 0): instale um client como **DBeaver** (gratuito, dbeaver.io) → New Connection → PostgreSQL → cole host/porta/usuário/senha do Session pooler → Test Connection. Se conectar, está pronto.
4. **Storage**: Storage → `verification-evidences` → faça upload manual de qualquer imagem de teste → clique nela → **Get URL** deve exigir signed URL (confirma que o bucket é privado). Delete o arquivo de teste depois.

---

## PARTE H — Ambiente local com Supabase CLI (OPCIONAL — pode pular até o Módulo 0)

Para desenvolver sem depender da nuvem:

### H1. Docker Desktop
1. Baixe em `docker.com/products/docker-desktop` → instalador Windows.
2. Na instalação, aceite **Use WSL 2** (se o Windows pedir, ele instala o WSL sozinho; reinicie a máquina quando solicitado).
3. Abra o Docker Desktop e aguarde o status "Engine running".

### H2. Scoop + Supabase CLI (PowerShell)
```powershell
# instalar o Scoop (gerenciador de pacotes)
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# instalar o CLI do Supabase
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# conferir
supabase --version
```

### H3. Subir o stack local
```powershell
cd c:\Users\samur\OneDrive\Desktop\projetos\trust
supabase init     # cria a pasta supabase/ com config
supabase start    # baixa e sobe os containers (demora na 1ª vez)
supabase status   # mostra as URLs locais (DB em 127.0.0.1:54322, Studio em 54323)
supabase stop     # para tudo quando terminar
```
No `.env` de desenvolvimento local, a `DATABASE_URL` vira a do `supabase status` (usuário `postgres`, senha `postgres`, porta `54322`).

---

## Checklist final

- [ ] Conta + organização `trust-platform` criadas
- [ ] Projeto `trust-dev` em São Paulo, senha do banco guardada
- [ ] Data API desabilitada · Auth desabilitado
- [ ] URIs do Session pooler e Direct connection guardadas
- [ ] Project URL + service key guardadas (fora do Git)
- [ ] Bucket privado `verification-evidences` criado
- [ ] `.env` preenchido a partir do `.env.example`
- [ ] `select version();` e `show timezone;` testados no SQL Editor
- [ ] (Opcional) Docker + Supabase CLI locais funcionando

## Antes de produção (`trust-prod`) — deixar anotado

- Criar projeto separado no plano **Pro**; repetir Partes B–E
- Ativar **PITR** (Point-in-Time Recovery) em Database → Backups
- Restringir acesso à rede: Project Settings → Database → **Network Restrictions** (só IPs do backend)
- Senha do banco e service key diferentes das de dev
