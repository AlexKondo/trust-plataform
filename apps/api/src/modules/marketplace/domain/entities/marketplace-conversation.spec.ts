import { describe, expect, it } from 'vitest';
import {
  MarketplaceConversationAccessDeniedException,
  MarketplaceConversationAlreadyClosedException,
  MarketplaceConversationClosedException,
} from '../exceptions/marketplace.exceptions';
import { MarketplaceConversation, MarketplaceMessage } from './marketplace-conversation';
import { CONVERSATION_STATUS } from './marketplace-types';

const LISTING = '019fe41e-0000-7000-8000-0000000000a1';
const SELLER = '019fe41e-0000-7000-8000-000000000001';
const BUYER = '019fe41e-0000-7000-8000-000000000002';
const STRANGER = '019fe41e-0000-7000-8000-000000000003';

const newConversation = () =>
  MarketplaceConversation.open({ listingId: LISTING, sellerId: SELLER, buyerId: BUYER });

describe('MarketplaceConversation (MRK-006..008)', () => {
  it('abre OPEN vinculada a um único anúncio (BR-006)', () => {
    const conversation = newConversation();
    expect(conversation.status).toBe(CONVERSATION_STATUS.OPEN);
    expect(conversation.listingId).toBe(LISTING);
    expect(conversation.lastMessageAt).toBeNull();
  });

  it('só comprador e vendedor participam (BR-001)', () => {
    const conversation = newConversation();
    expect(conversation.isParticipant(SELLER)).toBe(true);
    expect(conversation.isParticipant(BUYER)).toBe(true);
    expect(conversation.isParticipant(STRANGER)).toBe(false);
    expect(() => conversation.assertParticipant(STRANGER)).toThrow(
      MarketplaceConversationAccessDeniedException,
    );
  });

  it('counterpartOf devolve sempre o outro lado', () => {
    const conversation = newConversation();
    expect(conversation.counterpartOf(SELLER)).toBe(BUYER);
    expect(conversation.counterpartOf(BUYER)).toBe(SELLER);
  });

  it('nova mensagem atualiza lastMessageAt (BR-007)', () => {
    const conversation = newConversation();
    const sentAt = new Date();
    conversation.registerMessage(sentAt);
    expect(conversation.lastMessageAt).toEqual(sentAt);
  });

  it('encerra registrando autor, momento e motivo (BR-005/BR-006)', () => {
    const conversation = newConversation();
    const closedAt = new Date();
    conversation.close(BUYER, '  Negociação concluída.  ', closedAt);

    expect(conversation.status).toBe(CONVERSATION_STATUS.CLOSED);
    expect(conversation.closedBy).toBe(BUYER);
    expect(conversation.closedAt).toEqual(closedAt);
    expect(conversation.closeReason).toBe('Negociação concluída.');
  });

  it('motivo em branco vira null (opcional)', () => {
    const conversation = newConversation();
    conversation.close(SELLER, '   ');
    expect(conversation.closeReason).toBeNull();
  });

  it('terceiro não encerra a conversa (BR-001)', () => {
    const conversation = newConversation();
    expect(() => conversation.close(STRANGER, null)).toThrow(
      MarketplaceConversationAccessDeniedException,
    );
  });

  it('conversa encerrada não encerra de novo (BR-002)', () => {
    const conversation = newConversation();
    conversation.close(SELLER, null);
    expect(() => conversation.close(BUYER, null)).toThrow(
      MarketplaceConversationAlreadyClosedException,
    );
  });

  it('conversa encerrada não recebe mensagem (BR-003 do MRK-008)', () => {
    const conversation = newConversation();
    conversation.close(SELLER, null);
    expect(() => conversation.registerMessage()).toThrow(MarketplaceConversationClosedException);
  });
});

describe('MarketplaceMessage (MRK-007)', () => {
  it('nasce não lida, com remetente e conteúdo aparados (BR-003/BR-006)', () => {
    const message = MarketplaceMessage.create({
      conversationId: LISTING,
      senderId: BUYER,
      message: '  Olá, ainda está disponível?  ',
    });
    expect(message.senderId).toBe(BUYER);
    expect(message.message).toBe('Olá, ainda está disponível?');
    expect(message.read).toBe(false);
    expect(message.readAt).toBeNull();
  });

  it('não expõe setter de conteúdo — imutável após o envio (BR-004/BR-005)', () => {
    const message = MarketplaceMessage.create({
      conversationId: LISTING,
      senderId: BUYER,
      message: 'texto original',
    });
    const props = message.toProps();
    props.message = 'texto adulterado';
    expect(message.message).toBe('texto original');
  });
});
