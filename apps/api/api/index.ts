import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/main';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Entry point serverless (Vercel) para a API da Trust Platform.
 *
 * Vercel mapeia `api/index.ts` (raiz do projeto Vercel = `apps/api/`) para
 * uma Function que recebe TODAS as requisições HTTP (ver `apps/api/vercel.json`
 * — rewrite catch-all para cá). `createApp()` (de `../src/main.ts`) monta o
 * app Nest/Fastify SEM chamar `.listen()` — serverless não liga porta.
 *
 * Cache entre invocações: contêineres "quentes" da Vercel reaproveitam o
 * módulo entre chamadas, então mantemos a instância do app (e sua Promise de
 * bootstrap) em variável de módulo. Isso evita reconstruir o grafo de DI do
 * Nest a cada request — mas é best-effort: em cold start (novo contêiner) o
 * app é reconstruído do zero, e não há garantia de quanto tempo um contêiner
 * fica quente.
 *
 * Ponte Fastify → handler Node (req, res) da Vercel: depois que o adapter
 * Fastify está `.ready()`, o servidor HTTP interno do Fastify (acessível via
 * `getHttpAdapter().getInstance().server`) pode receber a requisição bruta
 * emitindo o evento `'request'` diretamente nele — é o padrão documentado
 * pela própria Fastify para rodar como função serverless (Vercel/AWS Lambda)
 * sem abrir uma porta TCP. Verificado contra fastify@5.10.0 (package.json) —
 * a API de servidor HTTP nativo do Node por trás do Fastify não mudou nessa
 * versão; se uma futura major do Fastify remover/alterar `.server`, este
 * bridge precisa ser revisado.
 */
let appPromise: Promise<NestFastifyApplication> | undefined;

async function getApp(): Promise<NestFastifyApplication> {
  if (!appPromise) {
    appPromise = createApp()
      .then(async (app) => {
        await app.init();
        await app.getHttpAdapter().getInstance().ready();
        return app;
      })
      .catch((error) => {
        // Não deixa uma Promise rejeitada "presa" no cache — próxima
        // invocação tenta reconstruir o app do zero.
        appPromise = undefined;
        throw error;
      });
  }
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await getApp();
  app.getHttpAdapter().getInstance().server.emit('request', req, res);
}
