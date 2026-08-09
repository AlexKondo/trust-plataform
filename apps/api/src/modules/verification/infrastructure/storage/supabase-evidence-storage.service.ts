import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import {
  EvidenceStorageService,
  StoredEvidence,
} from '../../domain/services/evidence-storage.service';

const BUCKET = 'verification-evidences';

/** Upload para o bucket privado do Supabase Storage via service role. */
@Injectable()
export class SupabaseEvidenceStorageService extends EvidenceStorageService {
  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SupabaseEvidenceStorageService.name);
  }

  async upload(input: {
    storageKey: string;
    content: Buffer;
    mimeType: string;
  }): Promise<StoredEvidence> {
    const response = await fetch(
      `${this.config.supabaseUrl}/storage/v1/object/${BUCKET}/${input.storageKey}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.supabaseServiceRoleKey}`,
          'content-type': input.mimeType,
          'x-upsert': 'false',
        },
        body: new Uint8Array(input.content),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      this.logger.error(
        {
          operation: 'EvidenceUpload',
          statusCode: response.status,
          providerResponse: body.slice(0, 200),
          result: 'FAILURE',
        },
        'Supabase Storage rejected the evidence upload.',
      );
      throw new Error(`Evidence upload failed with status ${response.status}`);
    }
    return { storageKey: input.storageKey };
  }
}

/** Fallback para testes/CI — não persiste conteúdo. */
@Injectable()
export class InMemoryEvidenceStorageService extends EvidenceStorageService {
  readonly uploaded: string[] = [];

  upload(input: { storageKey: string }): Promise<StoredEvidence> {
    this.uploaded.push(input.storageKey);
    return Promise.resolve({ storageKey: input.storageKey });
  }
}
