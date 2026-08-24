import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { IdentityRepository } from '../../../identity/domain/repositories/identity.repository';
import { TrustScoreRepository } from '../../../trust-score/infrastructure/persistence/drizzle-trust-score.repository';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { LISTING_STATUS, LISTING_TYPE } from '../../domain/entities/marketplace-types';
import {
  MarketplaceListingIncompleteException,
  MarketplaceListingOwnershipException,
  MarketplacePublicationNotAllowedException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { PublishListingUseCase } from './publish-listing.usecase';

const OWNER = '019fe41e-0000-7000-8000-000000000001';
const OTHER = '019fe41e-0000-7000-8000-000000000002';
const CATEGORY_ID = '019fe41e-0000-7000-8000-0000000000c1';

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

const LEVEL_RULES = [
  { level: 'UNVERIFIED', minScore: 0, maxScore: 0, rank: 0, active: true },
  { level: 'BRONZE', minScore: 1, maxScore: 249, rank: 1, active: true },
  { level: 'SILVER', minScore: 250, maxScore: 499, rank: 2, active: true },
];

function draft(complete = true): MarketplaceListing {
  return MarketplaceListing.createDraft({
    ownerId: OWNER,
    title: 'Instalação elétrica residencial',
    description: complete ? 'Tomadas, disjuntores e chuveiros com garantia de 90 dias.' : undefined,
    listingType: complete ? LISTING_TYPE.SERVICE : undefined,
    categoryId: complete ? CATEGORY_ID : undefined,
    price: complete ? 150 : undefined,
    currency: 'BRL',
  });
}

function makeScenario(options: {
  listing: MarketplaceListing;
  minimumTrustLevel?: string | null;
  score?: { score: number; level: string } | null;
  identityStatus?: string;
}) {
  const listingRepository = {
    findById: vi.fn().mockResolvedValue(options.listing),
    findCategoryById: vi.fn().mockResolvedValue({
      id: CATEGORY_ID,
      code: 'ELECTRICAL',
      name: 'Elétrica',
      description: null,
      minimumTrustLevel:
        options.minimumTrustLevel === undefined ? 'SILVER' : options.minimumTrustLevel,
      minimumScore: 0,
      active: true,
    }),
    save: vi.fn().mockResolvedValue(undefined),
    listImages: vi.fn().mockResolvedValue([]),
  } as unknown as MarketplaceListingRepository;
  const identityRepository = {
    findById: vi.fn().mockResolvedValue({ status: options.identityStatus ?? 'ACTIVE' }),
  } as unknown as IdentityRepository;
  const trustScoreRepository = {
    findScoreByIdentityId: vi
      .fn()
      .mockResolvedValue(options.score === undefined ? { score: 275, level: 'SILVER' } : options.score),
    listLevelRules: vi.fn().mockResolvedValue(LEVEL_RULES),
  } as unknown as TrustScoreRepository;
  const outbox = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt' }),
  } as unknown as OutboxService;
  const audit = {
    record: vi.fn().mockResolvedValue(undefined),
    recordSafe: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(Symbol('tx'))),
  } as unknown as Database;

  return {
    listingRepository,
    outbox,
    audit,
    useCase: new PublishListingUseCase(
      listingRepository,
      identityRepository,
      trustScoreRepository,
      outbox,
      audit,
      db,
      logger(),
    ),
  };
}

describe('PublishListingUseCase (MRK-003)', () => {
  it('publica quando dono, anúncio completo e reputação suficiente', async () => {
    const listing = draft();
    const { useCase, outbox } = makeScenario({ listing });

    const response = await useCase.execute(OWNER, listing.id);

    expect(response.status).toBe(LISTING_STATUS.PUBLISHED);
    expect(response.publishedAt).not.toBeNull();
    const event = vi.mocked(outbox.enqueue).mock.calls[0]?.[1];
    expect(event).toMatchObject({ eventType: 'MarketplaceListing.Published' });
  });

  it('não publica anúncio de terceiro (BR-001)', async () => {
    const listing = draft();
    const { useCase } = makeScenario({ listing });
    await expect(useCase.execute(OTHER, listing.id)).rejects.toThrow(
      MarketplaceListingOwnershipException,
    );
  });

  it('não publica rascunho incompleto (BR-003)', async () => {
    const listing = draft(false);
    const { useCase } = makeScenario({ listing });
    await expect(useCase.execute(OWNER, listing.id)).rejects.toThrow(
      MarketplaceListingIncompleteException,
    );
  });

  it('bloqueia quando o nível é menor que o exigido pela categoria (BR-005)', async () => {
    const listing = draft();
    const { useCase, audit } = makeScenario({ listing, score: { score: 25, level: 'BRONZE' } });

    await expect(useCase.execute(OWNER, listing.id)).rejects.toThrow(
      MarketplacePublicationNotAllowedException,
    );
    expect(listing.status).toBe(LISTING_STATUS.DRAFT);
    expect(audit.recordSafe).toHaveBeenCalledWith(expect.objectContaining({ result: 'DENIED' }));
  });

  it('bloqueia identidade não ativa (BR-004)', async () => {
    const listing = draft();
    const { useCase } = makeScenario({
      listing,
      identityStatus: 'PENDING_EMAIL_VERIFICATION',
      minimumTrustLevel: null,
    });
    await expect(useCase.execute(OWNER, listing.id)).rejects.toThrow(
      MarketplacePublicationNotAllowedException,
    );
  });

  it('categoria sem exigência publica mesmo sem score', async () => {
    const listing = draft();
    const { useCase } = makeScenario({ listing, minimumTrustLevel: null, score: null });
    const response = await useCase.execute(OWNER, listing.id);
    expect(response.status).toBe(LISTING_STATUS.PUBLISHED);
  });
});
