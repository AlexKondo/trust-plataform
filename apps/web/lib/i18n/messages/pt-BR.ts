/**
 * IP-002 — catálogo de mensagens PT-BR (default do produto).
 * Fatia representativa da arquitetura de i18n: navegação, o próprio seletor
 * de idioma (fluxo NOVO desta IP) e um recorte de rótulos de enum já
 * existentes em `lib/labels.ts` (nível e status do pedido), para provar que o
 * MESMO catálogo pode alimentar tanto telas novas quanto vocabulário de
 * negócio existente. Não é a tradução completa do produto — isso é
 * explicitamente fora do escopo do IP-002 (fundação, não cobertura total).
 *
 * Vocabulário canônico (Trust Member, Trust Partner, Trust Score, Trust
 * Passport etc. — 04_APPROVED_PRODUCT_DECISIONS) NUNCA é traduzido: os
 * identificadores de marca são language-neutral por definição de produto.
 */
export const messages = {
  nav: {
    home: 'Início',
    trustScore: 'Trust Score',
    trustPassport: 'Trust Passport',
    verifications: 'Verificações',
    marketplace: 'Marketplace',
    conversations: 'Conversas',
    orders: 'Pedidos',
    moderation: 'Moderação',
    settings: 'Configurações',
    logout: 'Sair',
  },
  common: {
    save: 'Salvar',
    cancel: 'Cancelar',
    loading: 'Carregando...',
    genericError: 'Algo deu errado. Tente novamente.',
  },
  settings: {
    sectionTitle: 'Idioma',
    sectionDescription: 'Escolha em que idioma você quer ver a plataforma.',
    pageTitle: 'Idioma',
    pageSubtitle: 'Sua preferência é salva na sua conta e vale em qualquer dispositivo.',
    current: 'Idioma atual',
    savedMessage: 'Idioma atualizado.',
    errorMessage: 'Não foi possível salvar o idioma agora.',
  },
  levels: {
    UNVERIFIED: 'Não verificado',
    BRONZE: 'Bronze',
    SILVER: 'Prata',
    GOLD: 'Ouro',
    PLATINUM: 'Platina',
  },
  privacy: {
    dataSectionTitle: 'Meus dados (LGPD)',
    dataSectionHint: 'Acesse ou peça a exclusão dos dados vinculados à sua conta.',
    exportButton: 'Baixar meus dados',
    exportSuccess: 'Seus dados foram baixados.',
    exportError: 'Não foi possível gerar sua exportação agora.',
    deleteButton: 'Solicitar exclusão da minha conta',
    deleteConfirmLabel:
      'Entendo que meus dados de cadastro serão anonimizados e não poderei mais acessar esta conta.',
    deleteSuccess: 'Conta anonimizada. Você será desconectado.',
    deleteRejectedPrefix: 'Não foi possível excluir agora:',
    deleteRejected_ACTIVE_ORDERS: 'existem pedidos em andamento vinculados à sua conta.',
    deleteRejected_ACTIVE_CUSTODY: 'existem valores em custódia vinculados à sua conta.',
    deleteRejected_ACTIVE_SERVICE_REQUEST: 'existem pedidos de serviço em aberto vinculados à sua conta.',
    historyTitle: 'Solicitações anteriores',
    historyEmpty: 'Nenhuma solicitação registrada ainda.',
    statusRequested: 'Solicitado',
    statusProcessing: 'Processando',
    statusCompleted: 'Concluído',
    statusRejected: 'Rejeitado',
    typeExport: 'Exportação de dados',
    typeDeletion: 'Exclusão de conta',
  },
  orderStatus: {
    CREATED: 'Criado',
    AWAITING_SCHEDULING: 'Aguardando agendamento',
    SCHEDULED: 'Agendado',
    AWAITING_EXECUTION: 'Aguardando execução',
    IN_PROGRESS: 'Em andamento',
    AWAITING_CUSTOMER_CONFIRMATION: 'Aguardando sua confirmação',
    CUSTOMER_CONFIRMED: 'Confirmado pelo cliente',
    COMPLETED: 'Concluído',
    CLOSED: 'Encerrado',
    CANCELLED: 'Cancelado',
    DISPUTE_OPEN: 'Em disputa',
    DISPUTE_RESOLVED: 'Disputa resolvida',
    REFUNDED: 'Reembolsado',
  },
};

export type Messages = typeof messages;
