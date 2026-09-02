import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service';
import {
  EvidenceStorageService,
  StoredEvidence,
  UploadEvidenceInput,
} from './evidence-storage.service';

/** Upload para um bucket privado do Supabase Storage via service role. */
@Injectable()
export class SupabaseEvidenceStorageService extends EvidenceStorageService {
  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SupabaseEvidenceStorageService.name);
  }

  async upload(input: UploadEvidenceInput): Promise<StoredEvidence> {
    const response = await fetch(
      `${this.config.supabaseUrl}/storage/v1/object/${input.bucket}/${input.storageKey}`,
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
          bucket: input.bucket,
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

  upload(input: UploadEvidenceInput): Promise<StoredEvidence> {
    this.uploaded.push(`${input.bucket}/${input.storageKey}`);
    return Promise.resolve({ storageKey: input.storageKey });
  }
}
