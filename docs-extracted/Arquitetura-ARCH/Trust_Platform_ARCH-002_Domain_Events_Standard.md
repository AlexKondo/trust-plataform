Trust Platform
ARCH-002 — Domain Events Standard
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-002
	
Document Name
	Domain Events Standard
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering
	
Applies To
	Todos os módulos e serviços da Trust Platform
	
Depends On
	ARCH-001 — Event-Driven Architecture
	
1. Objetivo
Definir o padrão oficial para criação, nomenclatura, estrutura, versionamento, publicação, consumo e governança dos Domain Events da Trust Platform. O objetivo é garantir contratos consistentes, interoperabilidade entre domínios, rastreabilidade e evolução segura da plataforma.
2. Escopo
Este padrão aplica-se a todos os eventos publicados entre bounded contexts, incluindo eventos de Marketplace, Payments, Identity, Trust Score, Trust Economy, Notifications, AI e futuros módulos.
3. Definição de Domain Event
Domain Event representa um fato relevante que já ocorreu dentro de um domínio. Eventos não devem representar comandos ou instruções para outro domínio.
Exemplo correto: MarketplaceOrder.CustomerConfirmed
Exemplo incorreto: MarketplaceOrder.ConfirmCustomer
4. Princípios
Eventos representam fatos ocorridos.
Eventos são contratos entre produtores e consumidores.
Eventos devem ser imutáveis após publicação.
Eventos devem ser versionados.
Consumidores devem ser idempotentes.
Payloads devem conter somente dados necessários.
Dados sensíveis devem ser minimizados.
Todo evento deve ser rastreável.
Breaking changes exigem nova versão.
5. Naming Convention
O nome lógico do evento deverá seguir:
BoundedContext.Entity.Event
Exemplos:
MarketplaceOrder.Created
MarketplaceOrder.CustomerConfirmed
Payment.Created
Payment.Authorized
TrustCustody.Created
Funds.Released
Funds.Settled
FinancialCase.Opened
FinancialReconciliation.Completed
O nome deve utilizar linguagem de negócio e evitar detalhes técnicos de implementação.
6. Event Envelope
Todo evento deverá possuir um envelope padronizado contendo metadados comuns.
Campo
	Tipo
	Obrigatório
	
eventId
	UUID
	Sim
	
eventType
	String
	Sim
	
eventVersion
	Integer/String
	Sim
	
occurredAt
	Timestamp
	Sim
	
producer
	String
	Sim
	
aggregateType
	String
	Sim
	
aggregateId
	UUID/String
	Sim
	
correlationId
	UUID/String
	Sim
	
causationId
	UUID/String
	Não
	
payload
	Object
	Sim
	
7. Event ID
eventId identifica exclusivamente uma publicação de evento e deverá ser utilizado para deduplicação, auditoria e rastreamento.
8. Correlation ID
correlationId identifica o fluxo de negócio completo. Todas as mensagens, chamadas e operações decorrentes de uma mesma transação deverão preservar esse identificador sempre que possível.
9. Causation ID
causationId identifica o evento ou comando que causou o evento atual. Ele permite reconstruir a cadeia causal de uma operação.
10. Aggregate Identity
aggregateType e aggregateId deverão identificar o agregado responsável pelo fato publicado.
Exemplo: aggregateType = Payment; aggregateId = UUID do Payment.
11. Payload
O payload deve conter somente informações necessárias para que consumidores executem suas responsabilidades.
Não duplicar o banco de dados do produtor.
Não enviar segredos.
Evitar dados pessoais quando um identificador técnico for suficiente.
Evitar estruturas excessivamente aninhadas.
Preferir contratos estáveis e semanticamente claros.
12. Versionamento
Eventos são contratos. Alterações incompatíveis não poderão modificar silenciosamente o contrato existente.
Alterações compatíveis podem permanecer na mesma versão quando não quebrarem consumidores.
Breaking changes devem gerar nova versão.
Consumidores antigos devem continuar funcionando durante a janela de migração definida.
Versões obsoletas devem possuir política formal de sunset.
13. Compatibilidade
Alterações normalmente compatíveis:
Adicionar campos opcionais.
Adicionar valores de enum somente quando consumidores tolerarem valores desconhecidos.
Adicionar metadata não obrigatória.
Alterações normalmente incompatíveis:
Renomear ou remover campos obrigatórios.
Alterar semântica de um campo.
Alterar tipo de dado.
Mudar significado do evento.
14. Idempotência do Consumidor
Todo consumidor deverá ser capaz de receber o mesmo evento mais de uma vez sem produzir efeitos duplicados.
Registrar eventId processado quando necessário.
Utilizar chave de idempotência apropriada ao caso de uso.
Operações financeiras devem possuir proteção adicional contra duplicidade.
15. Ordenação
Não existe garantia de ordenação global. Quando a ordem dos eventos de um agregado for necessária, a infraestrutura deverá utilizar particionamento por aggregateId, sequence number ou mecanismo equivalente.
16. Retentativas e DLQ
Falhas transitórias devem utilizar retry com backoff.
Falhas permanentes devem ser identificadas para evitar retry infinito.
Eventos não processáveis deverão ir para Dead Letter Queue.
Reprocessamento de DLQ deverá ser controlado e auditável.
17. Outbox Pattern
Quando a publicação do evento depender de uma mudança transacional no banco do produtor, deverá ser utilizado Outbox Pattern ou mecanismo equivalente.
18. Segurança e Privacidade
Aplicar princípio de menor privilégio aos produtores e consumidores.
Minimizar dados pessoais conforme Privacy by Design.
Não publicar senhas, tokens, CVV, chaves privadas ou credenciais.
Dados financeiros deverão ser tratados conforme requisitos de segurança aplicáveis.
19. Observabilidade
Logs estruturados devem registrar eventId, eventType, aggregateId e correlationId.
Métricas devem acompanhar publicação, consumo, latência, retries e DLQ.
Tracing distribuído deverá preservar correlationId e causationId.
20. Schema Registry e Governança
A Trust deverá manter um catálogo central dos eventos publicados, seus schemas, versões, produtores, consumidores e status de ciclo de vida.
Cada evento deverá possuir owner.
Cada versão deverá possuir documentação.
Eventos deprecados deverão possuir data de sunset.
Mudanças deverão passar por revisão técnica quando afetarem consumidores externos.
21. Exemplo de Evento
{
  "eventId": "uuid",
  "eventType": "Payment.Authorized",
  "eventVersion": "1",
  "occurredAt": "2026-08-20T19:00:00Z",
  "producer": "payments-service",
  "aggregateType": "Payment",
  "aggregateId": "uuid",
  "correlationId": "uuid",
  "causationId": "uuid",
  "payload": {
    "paymentId": "uuid",
    "amount": 1000.00,
    "currency": "BRL"
  }
}
22. Anti-Patterns Proibidos
Eventos que funcionem como comandos.
Payloads contendo tabelas completas do produtor.
Publicação de dados secretos ou desnecessários.
Breaking changes sem nova versão.
Consumidores sem idempotência.
Eventos sem correlationId.
Consumidores que dependam de ordem global não garantida.
23. Aplicação aos Módulos Existentes
Os eventos já definidos na Trust deverão migrar ou ser implementados seguindo este padrão.
MarketplaceOrder.CustomerConfirmed → Payments
Payment.Created → Authorization/Analytics
Payment.Authorized → TrustCustody
TrustCustody.Created → Ledger/Notifications
Funds.Released → Settlement
Funds.Settled → Distribution/Ledger
FundsRefund.Completed → Marketplace/Ledger
FinancialCase.Opened → Notifications/Audit
24. Definition of Done para um Novo Evento
Nome definido conforme padrão.
Owner definido.
Schema documentado.
Versão definida.
Payload revisado quanto à minimização de dados.
Produtor identificado.
Consumidores identificados.
Idempotência validada.
Observabilidade implementada.
Testes de contrato implementados.
25. Decisão Arquitetural
A Trust Platform adotará este padrão como contrato obrigatório para todos os Domain Events. Nenhum novo evento entre bounded contexts deverá ser criado fora deste padrão sem uma exceção arquitetural formalmente aprovada.
26. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-003 — Notification Architecture
ARCH-004 — Observability & Monitoring
ARCH-006 — Audit & Compliance
27. Princípio Fundamental
Um evento deve contar uma verdade do domínio, não ditar o que outro domínio deve fazer.
