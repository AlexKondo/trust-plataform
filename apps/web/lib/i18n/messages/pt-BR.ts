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
    serviceRequests: 'Minhas necessidades',
    conversations: 'Conversas',
    orders: 'Pedidos',
    myAvailability: 'Minha disponibilidade',
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
  // IP-011 — fallback quando a timeline não tem uma regra com descrição
  // (trust_score_rules.description já cobre o caso normal; isto é o caso
  // raro de um evento pontuado sem regra correspondente, ex.: dado legado).
  trustTimeline: {
    default: 'Evento de reputação registrado.',
  },
  // IP-011 — Trust Signals: fatos objetivos, sem efeito no Trust Score
  // (04_APPROVED_PRODUCT_DECISIONS: "a signal is not automatically fraud").
  trustSignals: {
    CHANGE_ORDER_SUBMITTED: 'Alteração de escopo proposta ao Trust Member.',
    CHANGE_ORDER_APPROVED: 'Alteração de escopo aprovada pelo Trust Member.',
    CHANGE_ORDER_REJECTED: 'Alteração de escopo recusada pelo Trust Member.',
    FUNDS_REFUND_COMPLETED: 'Reembolso processado neste pedido.',
  },
  // IP-017 — Trust Partner Experience: vocabulário novo desta IP.
  partner: {
    nav: 'Minha disponibilidade',
    availabilityTitle: 'Minha disponibilidade',
    availabilitySubtitle: 'Defina os horários em que você está disponível para novos serviços.',
    availabilityEmpty: 'Nenhuma janela cadastrada ainda. Adicione uma abaixo.',
    availabilityAddWindow: 'Adicionar janela',
    availabilityRemoveWindow: 'Remover',
    availabilitySaveAll: 'Salvar disponibilidade',
    availabilitySaved: 'Disponibilidade atualizada.',
    availabilitySaveError: 'Não foi possível salvar sua disponibilidade agora.',
    availabilityLoadError: 'Não foi possível carregar sua disponibilidade agora.',
    availabilityDay: 'Dia da semana',
    availabilityStart: 'Início',
    availabilityEnd: 'Fim',
    availabilityTimezone: 'Fuso horário',
    weekday: {
      d0: 'Domingo',
      d1: 'Segunda-feira',
      d2: 'Terça-feira',
      d3: 'Quarta-feira',
      d4: 'Quinta-feira',
      d5: 'Sexta-feira',
      d6: 'Sábado',
    },
    pauseReason: {
      PERSONAL_BREAK: 'Pausa pessoal',
      PERSONAL_CALL: 'Atendendo uma ligação',
      MEAL: 'Refeição',
      OTHER_NON_BILLABLE: 'Outro motivo não faturável',
    },
    changeOrderEvidenceType: {
      PHOTO: 'Foto',
      RECEIPT: 'Recibo',
      QUOTE: 'Orçamento',
      DOCUMENT: 'Documento',
      OTHER: 'Outro',
    },
    earningsTitle: 'Seus ganhos neste pedido',
    earningsHint: 'Valor bruto autorizado, Trust Fee e o líquido antes das taxas do meio de pagamento.',
    earningsGross: 'Valor bruto autorizado',
    earningsTrustFee: 'Trust Fee',
    earningsNet: 'Líquido (antes de taxas do PSP)',
    earningsNetHint: 'O valor final pode variar com as taxas do provedor de pagamento na liquidação.',
    travelTitle: 'Deslocamento até o cliente',
    travelDeclareEnRoute: 'Declarar que estou a caminho',
    travelEtaLabel: 'Tempo estimado até chegar (minutos)',
    travelDeclareArrived: 'Declarar chegada ao local',
    travelEnRouteSuccess: 'Deslocamento registrado.',
    travelArrivedSuccess: 'Chegada registrada.',
    executionTitle: 'Execução do serviço',
    pauseButton: 'Pausar execução (Trust Pause)',
    resumeButton: 'Retomar execução',
    pauseReasonLabel: 'Motivo da pausa',
    pauseNoteLabel: 'Observação (opcional)',
    pauseConfirm: 'Confirmar pausa',
    pauseSuccess: 'Execução pausada. O relógio faturável parou.',
    resumeSuccess: 'Execução retomada.',
    evidenceUploadTitle: 'Adicionar evidência de execução',
    evidenceTypeLabel: 'Tipo de evidência',
    evidenceFileLabel: 'Arquivo (foto ou PDF)',
    evidenceUploadButton: 'Enviar evidência',
    evidenceUploadSuccess: 'Evidência enviada.',
    evidenceUploadError: 'Não foi possível enviar essa evidência agora.',
    noteAddTitle: 'Registrar nota de serviço',
    noteBodyLabel: 'O que foi feito',
    noteAddButton: 'Salvar nota',
    noteAddSuccess: 'Nota registrada.',
    changeOrderProposeTitle: 'Propor alteração (Change Order)',
    changeOrderProposeHint:
      'Isto é apenas uma proposta: o valor só passa a valer depois que o Trust Member aprovar.',
    changeOrderTypeLabel: 'Tipo de alteração',
    changeOrderTypeAdditionalTime: 'Tempo adicional',
    changeOrderTypeScopeChange: 'Mudança de escopo',
    changeOrderTypeMaterial: 'Material adicional',
    changeOrderTypeMixed: 'Tempo, material e escopo',
    changeOrderAdditionalMinutesLabel: 'Minutos adicionais',
    changeOrderServiceDeltaLabel: 'Valor adicional de serviço',
    changeOrderMaterialCostLabel: 'Custo de material adicional',
    changeOrderMaterialMarkupLabel: 'Repasse (markup) de material',
    changeOrderReasonLabel: 'Motivo (obrigatório)',
    changeOrderDescriptionLabel: 'Descrição (opcional)',
    changeOrderSubmitButton: 'Enviar para aprovação do cliente',
    changeOrderSubmitSuccess: 'Alteração enviada para aprovação do cliente.',
    changeOrderSubmitError: 'Não foi possível enviar essa alteração agora.',
    changeOrderNoSelfApprove:
      'Você não pode aprovar sua própria alteração — o cliente precisa decidir.',
    proposeChangeOrderButton: 'Propor alteração',
  },
};

export type Messages = typeof messages;
