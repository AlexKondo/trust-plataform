/**
 * E2E do IP-015 (Search & Marketplace Retrieval): fecha os três gaps
 * confirmados no preflight sobre a busca pública do MRK-004
 * (`SearchListingsUseCase`/`DrizzleMarketplaceListingRepository.search()`,
 * reaproveitada verbatim, não reescrita):
 *   1. `sort=relevance` deixa de ser um alias 1:1 de `recent` quando `q` é
 *      informado — passa a ranquear por correspondência textual determinística
 *      (full-text search nativo do Postgres, sem motor externo/IA).
 *   2. Novo filtro opt-in `availableDayOfWeek`, join de leitura contra a
 *      disponibilidade declarada do Partner (IP-005), sem nenhuma coordenada.
 *   3. Paginação estável sob empate — todo ramo de ordenação termina em
 *      `id asc` como desempate determinístico.
 * Nenhum dos três motivos altera o schema/entidades do IP-003/004/005; a
 * migration 0034 só adiciona um índice (`trust_scores.identity_id`).
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main';
import { EmailService } from '../../src/modules/identity/domain/services/email.service';
import { LoggingEmailService } from '../../src/modules/identity/infrastructure/email/logging-email.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

interface SearchItem {
  listingId: string;
  title: string;
  seller: { trustScore: number | null; trustLevel: string | null };
}

describe.runIf(Boolean(testDatabaseUrl))('IP-015 — Search & Marketplace Retrieval e2e', () => {
  let app: NestFastifyApplication;
  let emailService: LoggingEmailService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip015-${uuidv7()}@e2e.trustplatform.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: { fullName, email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true },
    });
    const { identityId } = created.json<{ data: { identityId: string } }>().data;
    const token = new URL(emailService.lastSent!.verificationUrl).searchParams.get('token')!;
    await app.inject({ method: 'GET', url: `/api/v1/identities/verify-email?token=${token}` });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const accessToken = login.json<{ data: { accessToken: string } }>().data.accessToken;
    return { identityId, auth: { authorization: `Bearer ${accessToken}` } };
  }

  /** TECH tem `minimum_trust_level = NULL` e `minimum_score = 0` (seed 0015) —
   * uma identidade recém-verificada já publica aqui sem esperar o Trust Score
   * assíncrono (`PublishListingUseCase` usa `score ?? 0`/`level ?? 'UNVERIFIED'`
   * quando ainda não há linha em `trust_scores`), o que mantém este arquivo
   * rápido sem precisar do helper `waitForBronze` de outras IPs. */
  async function publishListing(
    seller: TestUser,
    input: { title: string; description: string; price: number; location?: string },
  ): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: input.title,
        description: input.description,
        listingType: 'SERVICE',
        category: 'TECH',
        price: input.price,
        currency: 'BRL',
        location: input.location ?? 'São Paulo/SP',
      },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;
    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    expect(published.statusCode).toBe(200);
    return listingId;
  }

  async function setAvailability(
    user: TestUser,
    windows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; timezone?: string }>,
  ): Promise<void> {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/marketplace/partner-availability',
      headers: user.auth,
      payload: { windows },
    });
    expect(response.statusCode).toBe(200);
  }

  async function search(query: string): Promise<{ data: SearchItem[]; pagination: { totalItems: number } }> {
    const response = await app.inject({ method: 'GET', url: `/api/v1/marketplace/listings?${query}` });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  beforeAll(async () => {
    const client = postgres(testDatabaseUrl!, { max: 1, prepare: false });
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
      migrationsTable: 'drizzle_migrations',
    });
    await client.end({ timeout: 5 });

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    emailService = app.get<LoggingEmailService>(EmailService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('availableDayOfWeek exclui anúncios de Partners sem aquela janela declarada (opt-in, não é a regra de agendamento)', async () => {
    const marker = `ip015disp${uuidv7().replace(/-/g, '').slice(0, 10)}`;
    const withAvailability = await createActiveUser('Otavio Ferraz Nogueira');
    const withoutAvailability = await createActiveUser('Beatriz Salgado Ramos');

    await setAvailability(withAvailability, [
      { dayOfWeek: 2, startMinute: 480, endMinute: 1080, timezone: 'America/Sao_Paulo' },
    ]);
    // `withoutAvailability` nunca declara nenhuma janela — IP-005 mantém isso
    // "sem restrição" para agendamento; este filtro de busca é o inverso
    // (opt-in de exibição), documentado em `ListingSearchCriteria.availableDayOfWeek`.

    const listingWith = await publishListing(withAvailability, {
      title: `Suporte técnico ${marker}`,
      description: 'Configuração de redes e computadores para escritórios.',
      price: 150,
    });
    const listingWithout = await publishListing(withoutAvailability, {
      title: `Suporte técnico ${marker}`,
      description: 'Configuração de redes e computadores para escritórios.',
      price: 150,
    });

    const unfiltered = await search(`q=${marker}`);
    expect(unfiltered.data.map((item) => item.listingId).sort()).toEqual(
      [listingWith, listingWithout].sort(),
    );

    const filteredTuesday = await search(`q=${marker}&availableDayOfWeek=2`);
    expect(filteredTuesday.data.map((item) => item.listingId)).toEqual([listingWith]);

    const filteredWednesday = await search(`q=${marker}&availableDayOfWeek=3`);
    expect(filteredWednesday.data).toHaveLength(0);
  });

  it('relevance ranqueia por correspondência textual, não é mais alias de recent (IP-000 §14 gap fechado)', async () => {
    const marker = `ip015rel${uuidv7().replace(/-/g, '').slice(0, 10)}`;
    const strongerMatchOlderSeller = await createActiveUser('Heitor Malaquias Pires');
    const weakerMatchNewerSeller = await createActiveUser('Priscila Andrade Vilela');

    // Publicado PRIMEIRO (mais antigo) mas com correspondência textual mais
    // forte (o termo se repete várias vezes) — se `relevance` ainda fosse um
    // alias de `recent`, este item apareceria DEPOIS do mais novo abaixo.
    const strongerOlder = await publishListing(strongerMatchOlderSeller, {
      title: `Consultoria avançada em ${marker}`,
      description: `${marker} ${marker} ${marker} ${marker} — especialista dedicado.`,
      price: 300,
    });

    // Publicado DEPOIS (mais novo) mas com correspondência textual mais fraca
    // (o termo aparece uma única vez).
    const weakerNewer = await publishListing(weakerMatchNewerSeller, {
      title: 'Ajuda pontual rápida',
      description: `Consigo ajudar com ${marker} se precisar.`,
      price: 300,
    });

    const result = await search(`q=${marker}`); // sort default = relevance
    const ids = result.data.map((item) => item.listingId);
    expect(ids).toContain(strongerOlder);
    expect(ids).toContain(weakerNewer);
    expect(ids.indexOf(strongerOlder)).toBeLessThan(ids.indexOf(weakerNewer));

    // Determinismo: duas chamadas idênticas devolvem exatamente a mesma ordem
    // — nenhum campo de patrocínio/destaque existe em `marketplace_listings`
    // (confirmado lendo o schema), então não há como um resultado variar
    // entre chamadas sem que os dados mudem.
    const repeat = await search(`q=${marker}`);
    expect(repeat.data.map((item) => item.listingId)).toEqual(ids);
  });

  it('paginação com empate (mesmo preço) não duplica nem pula itens — desempate por id', async () => {
    const marker = `ip015pag${uuidv7().replace(/-/g, '').slice(0, 10)}`;
    const seller = await createActiveUser('Vinicius Otero Campanha');
    const ids = await Promise.all(
      [1, 2, 3].map((n) =>
        publishListing(seller, {
          title: `Serviço ${marker} ${n}`,
          description: 'Mesmo preço para testar o desempate determinístico da paginação.',
          price: 777,
        }),
      ),
    );

    const page1 = await search(`q=${marker}&sort=price_asc&page=1&size=2`);
    const page2 = await search(`q=${marker}&sort=price_asc&page=2&size=2`);
    expect(page1.pagination.totalItems).toBe(3);
    const collected = [...page1.data, ...page2.data].map((item) => item.listingId);
    expect(collected).toHaveLength(3);
    expect(new Set(collected).size).toBe(3);
    expect(collected.sort()).toEqual([...ids].sort());
  });
});
